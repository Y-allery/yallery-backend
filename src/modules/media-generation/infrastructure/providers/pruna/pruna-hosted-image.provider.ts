import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { AI_SERVICES } from 'src/modules/media-generation/domain/ai-service.catalog';
import { MediaGenerationProvider } from 'src/modules/media-generation/domain/contracts/media-generation-provider.contract';
import { MediaCapability } from 'src/modules/media-generation/domain/enums/media-capability.enum';
import { MediaProvider } from 'src/modules/media-generation/domain/enums/media-provider.enum';
import { EditImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/edit-image-generation-request.contract';
import { MediaStyleDescriptor } from 'src/modules/media-generation/domain/contracts/media-style-descriptor.contract';
import { PromptImageGenerationResult } from 'src/modules/media-generation/domain/contracts/prompt-image-generation-result.contract';
import { ResolvedPromptImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/prompt-image-generation-request.contract';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';
import { UploadService } from 'src/modules/uploads/upload.service';

const SUBMIT_PATH = '/v1/predictions';
const STATUS_PATH = '/v1/predictions/status/';
const POLL_INTERVAL_MS = 1500;
const TIMEOUT_MS = 300_000;
const MAX_EDIT_REFERENCES = 3;

/**
 * The app's image generation, served by the same hosted models the partner API already
 * runs on (2026-08-13, Mark's call: the app's own workers spent more per call on cold
 * starts and GPU shortages than the hosted flat rate costs).
 *
 * The models here take a plain prompt and nothing else — no `style` object, and their
 * schemas reject unknown fields outright. The in-worker prompt upsampler that used to
 * weave the style descriptor into the prompt is gone with the worker, so this provider
 * does the weaving itself, plainly: positive phrase and keywords appended to the prompt.
 * The `negative` half of the descriptor has nowhere to go and is dropped — neither
 * hosted model accepts a negative prompt.
 */
@Injectable()
export class PrunaHostedImageMediaProvider implements MediaGenerationProvider {
  private readonly logger = new Logger(PrunaHostedImageMediaProvider.name);

  readonly provider = MediaProvider.PRUNA;
  readonly capabilities = [
    MediaCapability.IMAGE_GENERATE,
    MediaCapability.IMAGE_EDIT,
  ];

  constructor(
    private readonly providerRuntimeConfigService: ProviderRuntimeConfigService,
    private readonly uploadService: UploadService,
  ) {}

  async generatePromptImages(
    request: ResolvedPromptImageGenerationRequest,
  ): Promise<PromptImageGenerationResult> {
    if (request.aiService !== AI_SERVICES.PHOTO) {
      throw new Error(
        `Pruna hosted provider has no text-to-image mapping for ${request.aiService}`,
      );
    }

    const prompt = composePrompt(request.prompt, request.style);
    const count = Math.max(1, request.imageQuantity ?? 1);

    // One output per call upstream, so quantity is emulated. Seeds are stepped rather
    // than omitted everywhere, otherwise every image of a batch comes back identical.
    const baseSeed = Math.floor(Math.random() * 4_000_000_000);
    const urls: string[] = [];
    for (let index = 0; index < count; index++) {
      const url = await this.callModel('z-image-turbo', {
        prompt,
        width: request.width,
        height: request.height,
        seed: baseSeed + index,
        output_format: 'png',
      });
      urls.push(await this.uploadService.uploadByUrl(url));
    }

    return { imageUrls: urls };
  }

  async editImages(
    request: EditImageGenerationRequest,
  ): Promise<PromptImageGenerationResult> {
    // [0] is the canvas, the rest are references — same ordering contract the worker had.
    const references = (
      request.imageUrls?.length ? request.imageUrls : [request.imageUrl]
    )
      .filter(Boolean)
      .slice(0, MAX_EDIT_REFERENCES);

    const prompt = composePrompt(
      request.resolvedPrompt ?? request.translatedPrompt ?? request.prompt,
      request.style ?? null,
    );

    const url = await this.callModel('qwen-image-edit-plus', {
      prompt,
      image: references,
      aspect_ratio: 'match_input_image',
      output_format: 'png',
      seed: Math.floor(Math.random() * 4_000_000_000),
    });

    return { imageUrls: [await this.uploadService.uploadByUrl(url)] };
  }

  /** Submit, poll to a terminal state, return the delivery URL. */
  private async callModel(
    model: string,
    input: Record<string, unknown>,
  ): Promise<string> {
    const [baseUrl, apiKey] = await Promise.all([
      this.providerRuntimeConfigService
        .getString('PRUNA_API_BASE_URL')
        .then((v) => (v || 'https://api.pruna.ai').replace(/\/+$/, '')),
      this.providerRuntimeConfigService.getString('PRUNA_API_KEY'),
    ]);
    if (!apiKey) {
      throw new Error('PRUNA_API_KEY is not configured');
    }

    const startedAt = Date.now();
    const submitted = await axios.post(
      `${baseUrl}${SUBMIT_PATH}`,
      { input },
      {
        headers: { apikey: apiKey, Model: model },
        timeout: 60_000,
        validateStatus: () => true,
      },
    );
    if (submitted.status >= 400 || !submitted.data?.id) {
      throw new Error(
        `Pruna ${model} submit rejected: ${JSON.stringify(submitted.data).slice(0, 200)}`,
      );
    }

    for (;;) {
      if (Date.now() - startedAt > TIMEOUT_MS) {
        throw new Error(`Pruna ${model} generation timed out`);
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const status = await axios.get(
        `${baseUrl}${STATUS_PATH}${submitted.data.id}`,
        {
          headers: { apikey: apiKey },
          timeout: 30_000,
          validateStatus: () => true,
        },
      );
      const state = String(status.data?.status ?? '').toLowerCase();
      if (state === 'succeeded') {
        // Older models answer with a single url, newer ones with a list.
        const delivered =
          status.data?.output?.generation_url ?? status.data?.generation_url;
        const url = Array.isArray(delivered) ? delivered[0] : delivered;
        if (typeof url !== 'string' || !url) {
          throw new Error(`Pruna ${model} succeeded with no output url`);
        }
        return url;
      }
      if (['failed', 'canceled', 'cancelled', 'error'].includes(state)) {
        throw new Error(`Pruna ${model} generation ${state}`);
      }
    }
  }
}

function composePrompt(
  prompt: string,
  style: MediaStyleDescriptor | null | undefined,
): string {
  return [prompt, style?.positive, style?.keywords?.join(', ')]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
}
