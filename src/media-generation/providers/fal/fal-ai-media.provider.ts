import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import * as fal from '@fal-ai/serverless-client';
import axios from 'axios';
import { InjectRepository } from '@nestjs/typeorm';
import { AIEnum } from 'src/common/enums/ai.enum';
import { ServiceTokenService } from 'src/service-token/service-token.service';
import { UploadService } from 'src/upload/upload.service';
import { Repository } from 'typeorm';
import { AudioGenerationRequest } from '../../contracts/audio-generation-request.contract';
import { AudioGenerationResult } from '../../contracts/audio-generation-result.contract';
import { MediaGenerationProvider } from '../../contracts/media-generation-provider.contract';
import {
  ResolvedPromptImageGenerationRequest,
} from '../../contracts/prompt-image-generation-request.contract';
import { PromptImageGenerationResult } from '../../contracts/prompt-image-generation-result.contract';
import { MediaCapability } from '../../enums/media-capability.enum';
import { MediaProvider } from '../../enums/media-provider.enum';
import { AISettingsEntity } from '../../entities/legacy-ai-settings.entity';

@Injectable()
export class FalAiMediaProvider implements MediaGenerationProvider {
  readonly provider = MediaProvider.FAL_AI;

  private readonly audioModelMap: Record<
    string,
    { apiModel: string; tokenServiceKey: string }
  > = {
    mmaudio_v2: {
      apiModel: 'fal-ai/mmaudio-v2',
      // Legacy service tokens already exist under the hyphenated key.
      tokenServiceKey: 'mmaudio-v2',
    },
  };

  constructor(
    @InjectRepository(AISettingsEntity)
    private readonly aiSettingsRepository: Repository<AISettingsEntity>,
    private readonly serviceTokenService: ServiceTokenService,
    private readonly uploadService: UploadService,
  ) {}

  readonly capabilities = [
    MediaCapability.IMAGE_GENERATE,
    MediaCapability.IMAGE_EDIT,
    MediaCapability.AUDIO_GENERATE,
    MediaCapability.VIDEO_GENERATE,
  ];

  async generatePromptImages(
    request: ResolvedPromptImageGenerationRequest,
  ): Promise<PromptImageGenerationResult> {
    if (request.aiService !== 'flux_fine_tune') {
      throw new BadRequestException(
        `Unsupported Fal prompt image service ${request.aiService}`,
      );
    }

    if (!request.providerSettings?.finetuneId) {
      throw new BadRequestException(
        'finetuneId is required for flux_fine_tune prompt image generation.',
      );
    }

    const aiSetting = await this.aiSettingsRepository.findOne({
      where: {
        aiService: AIEnum.FLUX_PRO_FINE_TUNE,
        isActive: true,
      },
    });

    if (!aiSetting?.apiModel) {
      throw new BadRequestException(
        'Legacy flux_pro_fine_tune ai_settings row is missing or has no apiModel configured.',
      );
    }

    if (request.prompt.length > aiSetting.maxPromptLength) {
      throw new BadRequestException(
        `Prompt length must not exceed ${aiSetting.maxPromptLength} characters for ${aiSetting.name}.`,
      );
    }

    if (
      request.imageQuantity < aiSetting.minImages ||
      request.imageQuantity > aiSetting.maxImages
    ) {
      throw new BadRequestException(
        `imageQuantity must be between ${aiSetting.minImages} and ${aiSetting.maxImages} for ${aiSetting.name}.`,
      );
    }

    const token = await this.serviceTokenService.getNextAvailableToken(
      AIEnum.FLUX_PRO_FINE_TUNE,
    );
    fal.config({ credentials: token.token });

    let result: any;
    try {
      result = await (fal.run as any)(aiSetting.apiModel, {
        input: {
          prompt: request.resolvedPrompt ?? request.prompt,
          finetune_id: request.providerSettings.finetuneId,
          output_format: 'jpeg',
          safety_tolerance: 2,
          num_images: request.imageQuantity,
          guidance_scale: 15,
          num_inference_steps: 28,
          finetune_strength: request.providerSettings.finetuneStrength ?? 1,
        },
      });
    } catch (error: any) {
      if (token?.token) {
        await this.serviceTokenService.markTokenAsRateLimited(
          token,
          AIEnum.FLUX_PRO_FINE_TUNE,
        );
      }

      const details =
        error?.body ??
        error?.response?.data ??
        error?.data ??
        error?.message ??
        error;
      throw new BadGatewayException(
        `Fal prompt image generation failed: ${JSON.stringify(details)}`,
      );
    }

    if (!result?.images || !Array.isArray(result.images) || result.images.length === 0) {
      throw new BadGatewayException(
        `Fal prompt image model returned no images. Result: ${JSON.stringify(result)}`,
      );
    }

    const uploadedImageUrls = await Promise.all(
      result.images.map(async (image: any) => {
        if (!image?.url) {
          throw new BadGatewayException('FalAI returned an image without url');
        }
        return await this.uploadService.uploadByUrl(image.url);
      }),
    );

    return {
      imageUrls: uploadedImageUrls,
      rawOutput: result,
    };
  }

  async generateAudio(
    request: AudioGenerationRequest,
  ): Promise<AudioGenerationResult> {
    const prompt = request.prompt.trim();
    if (!prompt) {
      throw new BadRequestException('prompt is required');
    }

    const sourceVideoUrl = request.videoUrl.trim();
    if (!sourceVideoUrl) {
      throw new BadRequestException('videoUrl is required');
    }

    try {
      const head = await axios.head(sourceVideoUrl, {
        timeout: 8000,
        validateStatus: () => true,
      });

      if (head.status < 200 || head.status >= 400) {
        throw new BadRequestException(
          `video_url is not reachable (status ${head.status})`,
        );
      }
    } catch (error: any) {
      const message =
        error?.message || error?.toString?.() || 'unknown preflight error';
      throw new BadRequestException(
        `video_url preflight failed: ${message}. Make sure it is a public direct video URL.`,
      );
    }

    const audioModel = this.audioModelMap[request.aiService];
    if (!audioModel) {
      throw new BadRequestException(
        `Unsupported Fal audio service ${request.aiService}`,
      );
    }

    const token = await this.serviceTokenService.getNextAvailableToken(
      audioModel.tokenServiceKey,
    );
    fal.config({ credentials: token.token });

    let result: any;
    try {
      result = await (fal.run as any)(audioModel.apiModel, {
        input: {
          video_url: sourceVideoUrl,
          prompt,
          duration: 8,
        },
      });
    } catch (error: any) {
      if (token?.token) {
        await this.serviceTokenService.markTokenAsRateLimited(
          token,
          audioModel.tokenServiceKey,
        );
      }

      const details =
        error?.body ??
        error?.response?.data ??
        error?.data ??
        error?.message ??
        error;
      throw new BadGatewayException(
        `Fal audio generation failed: ${JSON.stringify(details)}`,
      );
    }

    const rawVideoUrl = result?.video?.url ?? result?.video?.[0]?.url;
    if (!rawVideoUrl) {
      throw new BadGatewayException(
        `Fal audio model returned no video. Result: ${JSON.stringify(result)}`,
      );
    }

    const uploadedVideoUrl =
      await this.uploadService.uploadVideoByUrl(rawVideoUrl);

    return {
      videoUrl: uploadedVideoUrl,
      rawOutput: result,
    };
  }
}
