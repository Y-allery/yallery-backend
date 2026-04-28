import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MEDIA_AUDIO_GENERATION_QUEUE,
  MEDIA_IMAGE_EDIT_GENERATION_QUEUE,
  MEDIA_IMAGE_VIDEO_GENERATION_QUEUE,
  MEDIA_MEME_GENERATION_QUEUE,
  MEDIA_PROMPT_IMAGE_GENERATION_QUEUE,
  MEDIA_TEXT_VIDEO_GENERATION_QUEUE,
  RUNPOD_IMAGE_GENERATION_QUEUE,
} from '../constants/media-generation.queue';
import { MediaGenerationRoute } from '../contracts/media-generation-route.contract';
import { MediaCapability } from '../enums/media-capability.enum';
import { MediaDispatch } from '../enums/media-dispatch.enum';
import { MediaProvider } from '../enums/media-provider.enum';

@Injectable()
export class MediaRouteResolverService {
  constructor(private readonly configService: ConfigService) {}

  resolvePromptImageRoute(aiService: string): MediaGenerationRoute | null {
    if (aiService === 'flux_fine_tune') {
      return {
        capability: MediaCapability.IMAGE_GENERATE,
        provider: MediaProvider.FAL_AI,
        dispatch: MediaDispatch.BULLMQ_QUEUE,
        aiService,
        queueName: MEDIA_PROMPT_IMAGE_GENERATION_QUEUE,
      };
    }

    if (
      aiService === 'sdxl_lora_generation' &&
      this.isRunpodSdxlLoraGenerationEnabled()
    ) {
      return {
        capability: MediaCapability.IMAGE_GENERATE,
        provider: MediaProvider.RUNPOD,
        dispatch: MediaDispatch.BULLMQ_QUEUE,
        aiService,
        endpointId: this.configService.get<string>(
          'RUNPOD_SDXL_LORA_GENERATION_ENDPOINT_ID',
        ),
        queueName: RUNPOD_IMAGE_GENERATION_QUEUE,
      };
    }

    if (aiService === 'flux2_klein' && this.isRunpodFlux2KleinEnabled()) {
      return {
        capability: MediaCapability.IMAGE_GENERATE,
        provider: MediaProvider.RUNPOD,
        dispatch: MediaDispatch.BULLMQ_QUEUE,
        aiService,
        endpointId: this.configService.get<string>(
          'RUNPOD_FLUX2_KLEIN_ENDPOINT_ID',
        ),
        queueName: RUNPOD_IMAGE_GENERATION_QUEUE,
      };
    }

    if (aiService === 'sdxl' && this.isRunpodSdxlEnabled()) {
      return {
        capability: MediaCapability.IMAGE_GENERATE,
        provider: MediaProvider.RUNPOD,
        dispatch: MediaDispatch.BULLMQ_QUEUE,
        aiService,
        endpointId: this.configService.get<string>('RUNPOD_SDXL_ENDPOINT_ID'),
        queueName: RUNPOD_IMAGE_GENERATION_QUEUE,
      };
    }

    return null;
  }

  resolveImageEditRoute(aiService: string): MediaGenerationRoute | null {
    if (
      aiService === 'qwen_image_edit_baked' &&
      this.isRunpodQwenImageEditBakedEnabled()
    ) {
      return {
        capability: MediaCapability.IMAGE_EDIT,
        provider: MediaProvider.RUNPOD,
        dispatch: MediaDispatch.BULLMQ_QUEUE,
        aiService,
        endpointId: this.configService.get<string>(
          'RUNPOD_QWEN_IMAGE_EDIT_BAKED_ENDPOINT_ID',
        ),
        queueName: MEDIA_IMAGE_EDIT_GENERATION_QUEUE,
      };
    }

    return null;
  }

  resolveAudioRoute(aiService: string): MediaGenerationRoute | null {
    if (aiService === 'mmaudio_v2') {
      return {
        capability: MediaCapability.AUDIO_GENERATE,
        provider: MediaProvider.FAL_AI,
        dispatch: MediaDispatch.BULLMQ_QUEUE,
        aiService,
        queueName: MEDIA_AUDIO_GENERATION_QUEUE,
      };
    }

    return null;
  }

  resolveTextVideoRoute(aiService: string): MediaGenerationRoute | null {
    if (aiService === 'p_video_text' && this.isRunpodPVideoEnabled()) {
      return {
        capability: MediaCapability.VIDEO_GENERATE,
        provider: MediaProvider.RUNPOD,
        dispatch: MediaDispatch.BULLMQ_QUEUE,
        aiService,
        endpointId: this.configService.get<string>('RUNPOD_P_VIDEO_ENDPOINT_ID'),
        queueName: MEDIA_TEXT_VIDEO_GENERATION_QUEUE,
      };
    }

    return null;
  }

  resolveImageVideoRoute(aiService: string): MediaGenerationRoute | null {
    if (aiService === 'p_video_image' && this.isRunpodPVideoEnabled()) {
      return {
        capability: MediaCapability.VIDEO_GENERATE,
        provider: MediaProvider.RUNPOD,
        dispatch: MediaDispatch.BULLMQ_QUEUE,
        aiService,
        endpointId: this.configService.get<string>('RUNPOD_P_VIDEO_ENDPOINT_ID'),
        queueName: MEDIA_IMAGE_VIDEO_GENERATION_QUEUE,
      };
    }

    return null;
  }

  resolveMemeRoute(aiService: string): MediaGenerationRoute | null {
    if (
      aiService === 'wan22_animate_native' &&
      this.isRunpodWan22AnimateMemeEnabled()
    ) {
      return {
        capability: MediaCapability.MEME_GENERATE,
        provider: MediaProvider.RUNPOD,
        dispatch: MediaDispatch.BULLMQ_QUEUE,
        aiService,
        endpointId: this.configService.get<string>(
          'RUNPOD_WAN22_ANIMATE_MEME_ENDPOINT_ID',
        ),
        queueName: MEDIA_MEME_GENERATION_QUEUE,
      };
    }

    return null;
  }

  describeRoutes() {
    const routes = [
      this.resolvePromptImageRoute('flux2_klein'),
      this.resolvePromptImageRoute('sdxl'),
      this.resolvePromptImageRoute('sdxl_lora_generation'),
      this.resolveImageEditRoute('qwen_image_edit_baked'),
      this.resolveAudioRoute('mmaudio_v2'),
      this.resolveTextVideoRoute('p_video_text'),
      this.resolveImageVideoRoute('p_video_image'),
      this.resolveMemeRoute('wan22_animate_native'),
    ].filter(Boolean);
    return routes;
  }

  private isRunpodFlux2KleinEnabled(): boolean {
    const isEnabled = this.configService.get<string>(
      'RUNPOD_FLUX2_KLEIN_ENABLED',
    );

    if (isEnabled && ['0', 'false', 'no'].includes(isEnabled.toLowerCase())) {
      return false;
    }

    return Boolean(
      this.configService.get<string>('RUNPOD_API_KEY') &&
        this.configService.get<string>('RUNPOD_FLUX2_KLEIN_ENDPOINT_ID'),
    );
  }

  private isRunpodSdxlEnabled(): boolean {
    const isEnabled = this.configService.get<string>('RUNPOD_SDXL_ENABLED');

    if (isEnabled && ['0', 'false', 'no'].includes(isEnabled.toLowerCase())) {
      return false;
    }

    return Boolean(
      this.configService.get<string>('RUNPOD_API_KEY') &&
        this.configService.get<string>('RUNPOD_SDXL_ENDPOINT_ID'),
    );
  }

  private isRunpodSdxlLoraGenerationEnabled(): boolean {
    const isEnabled = this.configService.get<string>(
      'RUNPOD_SDXL_LORA_GENERATION_ENABLED',
    );

    if (isEnabled && ['0', 'false', 'no'].includes(isEnabled.toLowerCase())) {
      return false;
    }

    return Boolean(
      this.configService.get<string>('RUNPOD_API_KEY') &&
        this.configService.get<string>(
          'RUNPOD_SDXL_LORA_GENERATION_ENDPOINT_ID',
        ),
    );
  }

  private isRunpodQwenImageEditBakedEnabled(): boolean {
    const isEnabled = this.configService.get<string>(
      'RUNPOD_QWEN_IMAGE_EDIT_BAKED_ENABLED',
    );

    if (isEnabled && ['0', 'false', 'no'].includes(isEnabled.toLowerCase())) {
      return false;
    }

    return Boolean(
      this.configService.get<string>('RUNPOD_API_KEY') &&
        this.configService.get<string>(
          'RUNPOD_QWEN_IMAGE_EDIT_BAKED_ENDPOINT_ID',
        ),
    );
  }

  private isRunpodPVideoEnabled(): boolean {
    const isEnabled = this.configService.get<string>('RUNPOD_P_VIDEO_ENABLED');

    if (isEnabled && ['0', 'false', 'no'].includes(isEnabled.toLowerCase())) {
      return false;
    }

    return Boolean(
      this.configService.get<string>('RUNPOD_API_KEY') &&
        this.configService.get<string>('RUNPOD_P_VIDEO_ENDPOINT_ID'),
    );
  }

  private isRunpodWan22AnimateMemeEnabled(): boolean {
    const isEnabled = this.configService.get<string>(
      'RUNPOD_WAN22_ANIMATE_MEME_ENABLED',
    );

    if (isEnabled && ['0', 'false', 'no'].includes(isEnabled.toLowerCase())) {
      return false;
    }

    return Boolean(
      this.configService.get<string>('RUNPOD_API_KEY') &&
        this.configService.get<string>(
          'RUNPOD_WAN22_ANIMATE_MEME_ENDPOINT_ID',
        ),
    );
  }
}
