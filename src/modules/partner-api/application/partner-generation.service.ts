import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RunpodOpenEndpointMediaProvider } from 'src/modules/media-generation/infrastructure/providers/runpod/runpod-open-endpoint-media.provider';
import { UploadService } from 'src/modules/uploads/upload.service';
import { PartnerApiUsageEntity } from '../entities/partner-api-usage.entity';
import {
  PartnerCapability,
  PartnerModel,
  findPartnerModel,
} from '../domain/partner-model.catalog';
import {
  HostedGenerationError,
  HostedMediaClient,
} from '../infrastructure/hosted-media.client';

export interface PartnerGenerationInput {
  model: string;
  prompt: string;
  images?: string[];
  size?: string;
  n?: number;
  seed?: number;
  capability: PartnerCapability;
}

export interface PartnerGenerationOutput {
  created: number;
  model: string;
  data: Array<{ url: string; seed?: number }>;
  usage: { generation_time_ms: number; price_usd: number };
}

const MAX_OUTPUTS = 4;
const MAX_REFERENCE_IMAGES = 3;

@Injectable()
export class PartnerGenerationService {
  private readonly logger = new Logger(PartnerGenerationService.name);

  constructor(
    private readonly hosted: HostedMediaClient,
    private readonly inhouse: RunpodOpenEndpointMediaProvider,
    private readonly uploads: UploadService,
    @InjectRepository(PartnerApiUsageEntity)
    private readonly usageRepository: Repository<PartnerApiUsageEntity>,
  ) {}

  private resolveModel(
    id: string,
    capability: PartnerCapability,
  ): PartnerModel {
    const model = findPartnerModel(id);
    if (!model) {
      throw new BadRequestException({
        error: {
          type: 'invalid_request_error',
          param: 'model',
          message: `Unknown model '${id}'. Call GET /v1/models for the list.`,
        },
      });
    }
    if (model.capability !== capability) {
      throw new BadRequestException({
        error: {
          type: 'invalid_request_error',
          param: 'model',
          message: `Model '${id}' does not support this endpoint. It is a ${model.capability} model.`,
        },
      });
    }
    return model;
  }

  private assertSize(model: PartnerModel, size?: string): string {
    const chosen = size?.trim() || model.sizes[0];
    if (!model.sizes.includes(chosen)) {
      throw new BadRequestException({
        error: {
          type: 'invalid_request_error',
          param: 'size',
          message: `Unsupported size '${chosen}' for '${model.id}'. Supported: ${model.sizes.join(', ')}.`,
        },
      });
    }
    return chosen;
  }

  private dimensionsOf(size: string): { width: number; height: number } {
    const [width, height] = size.split('x').map(Number);
    return { width, height };
  }

  async generate(
    input: PartnerGenerationInput,
    partnerKeyId: number,
  ): Promise<PartnerGenerationOutput> {
    const model = this.resolveModel(input.model, input.capability);
    const size = this.assertSize(model, input.size);
    const count = Math.min(Math.max(input.n ?? 1, 1), MAX_OUTPUTS);

    if (input.capability !== 'text_to_image') {
      if (!input.images?.length) {
        throw new BadRequestException({
          error: {
            type: 'invalid_request_error',
            param: 'images',
            message: 'At least one reference image URL is required.',
          },
        });
      }
      if (input.images.length > MAX_REFERENCE_IMAGES) {
        throw new BadRequestException({
          error: {
            type: 'invalid_request_error',
            param: 'images',
            message: `At most ${MAX_REFERENCE_IMAGES} reference images are accepted.`,
          },
        });
      }
    }

    const startedAt = Date.now();
    try {
      const data =
        model.backend === 'hosted'
          ? await this.runHosted(model, input, size, count)
          : await this.runInhouse(model, input, size, count);

      const elapsed = Date.now() - startedAt;
      const price = +(model.priceUsd * data.length).toFixed(5);
      await this.record(partnerKeyId, model, elapsed, 'succeeded', null, price);

      return {
        created: Math.floor(Date.now() / 1000),
        model: model.id,
        data,
        usage: { generation_time_ms: elapsed, price_usd: price },
      };
    } catch (error) {
      await this.record(
        partnerKeyId,
        model,
        Date.now() - startedAt,
        'failed',
        error instanceof HostedGenerationError ? error.stage : 'internal',
        0,
      );
      // Upstream vocabulary stops here. A partner never learns which engine ran, or that
      // one exists — including from a failure.
      if (error instanceof BadRequestException) throw error;
      this.logger.error(
        `partner generation failed for ${model.id} (${model.backend}/${model.target})`,
        error?.stack ?? error?.message ?? String(error),
      );
      throw new BadRequestException({
        error: {
          type: 'generation_error',
          message: 'Generation failed. Retry; if it persists, contact support.',
        },
      });
    }
  }

  private async runHosted(
    model: PartnerModel,
    input: PartnerGenerationInput,
    size: string,
    count: number,
  ): Promise<Array<{ url: string; seed?: number }>> {
    const results: Array<{ url: string; seed?: number }> = [];
    for (let index = 0; index < count; index++) {
      // The upstream returns one image per call, so `n` is emulated. Seeds are stepped
      // rather than reused, otherwise every output of a batch is identical.
      const seed = (input.seed ?? Math.floor(Math.random() * 4_000_000_000)) + index;
      const payload = this.hostedPayload(model, input, size, seed);
      const result = await this.hosted.generate(model.target, payload);
      results.push({ url: await this.rehost(result.url, model), seed });
    }
    return results;
  }

  /**
   * Copies a hosted output into our own storage.
   *
   * Two reasons, either sufficient: the upstream's delivery URL names the upstream, which
   * is the one thing this whole module exists to hide; and it is short-lived, so a partner
   * who stores the link we hand back would find it dead. The in-house path already does
   * this on its way out, which is why only this branch needs it.
   */
  private async rehost(url: string, model: PartnerModel): Promise<string> {
    if (model.capability === 'image_to_video') {
      return (await this.uploads.uploadVideoAssetByUrl(url)).videoUrl;
    }
    return this.uploads.uploadByUrl(url);
  }

  private hostedPayload(
    model: PartnerModel,
    input: PartnerGenerationInput,
    size: string,
    seed: number,
  ): Record<string, unknown> {
    if (model.capability === 'text_to_image') {
      const { width, height } = this.dimensionsOf(size);
      return {
        prompt: input.prompt,
        aspect_ratio: 'custom',
        width,
        height,
        prompt_upsampling: false,
        seed,
        disable_safety_checker: false,
      };
    }
    if (model.capability === 'image_to_image') {
      return {
        prompt: input.prompt,
        images: input.images,
        aspect_ratio: size === 'match_input_image' ? 'match_input_image' : '1:1',
        seed,
        disable_safety_checker: false,
      };
    }
    return {
      prompt: input.prompt,
      image: input.images?.[0],
      resolution: size,
      seed,
      disable_safety_checker: false,
    };
  }

  private async runInhouse(
    model: PartnerModel,
    input: PartnerGenerationInput,
    size: string,
    count: number,
  ): Promise<Array<{ url: string; seed?: number }>> {
    // Our own routes upload their output to our storage, so a partner gets a permanent
    // URL here while the hosted backend hands back a short-lived one.
    if (model.capability === 'text_to_image') {
      const { width, height } = this.dimensionsOf(size);
      const result = await this.inhouse.generatePromptImages({
        aiService: model.target,
        prompt: input.prompt,
        imageQuantity: count,
        width,
        height,
        orientation: width >= height ? 'horizontal' : 'vertical',
      });
      return result.imageUrls.map((url) => ({ url }));
    }

    const images = input.images ?? [];
    if (model.capability === 'image_to_image') {
      const result = await this.inhouse.editImages({
        aiService: model.target,
        prompt: input.prompt,
        imageUrl: images[0],
        imageUrls: images,
      });
      return result.imageUrls.map((url) => ({ url }));
    }

    const result = await this.inhouse.generateImageVideos({
      aiService: model.target,
      prompt: input.prompt,
      imageUrl: images[0],
      duration: 5,
      orientation: 'horizontal',
      ...(input.seed != null && { seed: input.seed }),
    });
    return [{ url: result.videoUrl }];
  }

  private async record(
    partnerKeyId: number,
    model: PartnerModel,
    executionMs: number,
    status: string,
    failureCode: string | null,
    priceUsd: number,
  ): Promise<void> {
    try {
      await this.usageRepository.insert({
        partnerKeyId,
        model: model.id,
        capability: model.capability,
        backend: model.backend,
        priceUsd: priceUsd.toFixed(5),
        costUsd: model.costUsd.toFixed(5),
        executionMs,
        status,
        failureCode,
      });
    } catch (error) {
      // Billing rows are reconstructable from logs; losing one must not fail the call.
      this.logger.error(
        'failed to record partner usage',
        error?.stack ?? error?.message ?? String(error),
      );
    }
  }
}
