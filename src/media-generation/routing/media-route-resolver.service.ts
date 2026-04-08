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

    if (aiService === 'nano_banana' && this.isRunpodNanoBananaEnabled()) {
      return {
        capability: MediaCapability.IMAGE_GENERATE,
        provider: MediaProvider.RUNPOD,
        dispatch: MediaDispatch.BULLMQ_QUEUE,
        aiService,
        endpointId: this.configService.get<string>(
          'RUNPOD_NANO_BANANA_ENDPOINT_ID',
        ),
        queueName: RUNPOD_IMAGE_GENERATION_QUEUE,
      };
    }

    if (
      aiService === 'flux_schnell' &&
      this.isRunpodFluxSchnellEnabled()
    ) {
      return {
        capability: MediaCapability.IMAGE_GENERATE,
        provider: MediaProvider.RUNPOD,
        dispatch: MediaDispatch.BULLMQ_QUEUE,
        aiService,
        endpointId: this.configService.get<string>(
          'RUNPOD_FLUX_SCHNELL_ENDPOINT_ID',
        ),
        queueName: RUNPOD_IMAGE_GENERATION_QUEUE,
      };
    }

    return null;
  }

  resolveImageEditRoute(aiService: string): MediaGenerationRoute | null {
    if (aiService === 'qwen_image_edit' && this.isRunpodQwenImageEditEnabled()) {
      return {
        capability: MediaCapability.IMAGE_EDIT,
        provider: MediaProvider.RUNPOD,
        dispatch: MediaDispatch.BULLMQ_QUEUE,
        aiService,
        endpointId: this.configService.get<string>(
          'RUNPOD_QWEN_IMAGE_EDIT_ENDPOINT_ID',
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
      aiService === 'kling_v26_std_motion_control' &&
      this.isRunpodKlingMotionControlEnabled()
    ) {
      return {
        capability: MediaCapability.MEME_GENERATE,
        provider: MediaProvider.RUNPOD,
        dispatch: MediaDispatch.BULLMQ_QUEUE,
        aiService,
        endpointId: this.configService.get<string>(
          'RUNPOD_KLING_V26_STD_MOTION_CONTROL_ENDPOINT_ID',
        ),
        queueName: MEDIA_MEME_GENERATION_QUEUE,
      };
    }

    return null;
  }

  describeRoutes() {
    const routes = [
      this.resolvePromptImageRoute('nano_banana'),
      this.resolvePromptImageRoute('flux_schnell'),
      this.resolveImageEditRoute('qwen_image_edit'),
      this.resolveAudioRoute('mmaudio_v2'),
      this.resolveTextVideoRoute('p_video_text'),
      this.resolveImageVideoRoute('p_video_image'),
      this.resolveMemeRoute('kling_v26_std_motion_control'),
    ].filter(Boolean);
    return routes;
  }

  private isRunpodNanoBananaEnabled(): boolean {
    const isEnabled = this.configService.get<string>(
      'RUNPOD_NANO_BANANA_ENABLED',
    );

    if (isEnabled && ['0', 'false', 'no'].includes(isEnabled.toLowerCase())) {
      return false;
    }

    return Boolean(
      this.configService.get<string>('RUNPOD_API_KEY') &&
        this.configService.get<string>('RUNPOD_NANO_BANANA_ENDPOINT_ID'),
    );
  }

  private isRunpodFluxSchnellEnabled(): boolean {
    const isEnabled = this.configService.get<string>(
      'RUNPOD_FLUX_SCHNELL_ENABLED',
    );

    if (isEnabled && ['0', 'false', 'no'].includes(isEnabled.toLowerCase())) {
      return false;
    }

    return Boolean(
      this.configService.get<string>('RUNPOD_API_KEY') &&
        this.configService.get<string>('RUNPOD_FLUX_SCHNELL_ENDPOINT_ID'),
    );
  }

  private isRunpodQwenImageEditEnabled(): boolean {
    const isEnabled = this.configService.get<string>(
      'RUNPOD_QWEN_IMAGE_EDIT_ENABLED',
    );

    if (isEnabled && ['0', 'false', 'no'].includes(isEnabled.toLowerCase())) {
      return false;
    }

    return Boolean(
      this.configService.get<string>('RUNPOD_API_KEY') &&
        this.configService.get<string>('RUNPOD_QWEN_IMAGE_EDIT_ENDPOINT_ID'),
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

  private isRunpodKlingMotionControlEnabled(): boolean {
    const isEnabled = this.configService.get<string>(
      'RUNPOD_KLING_V26_STD_MOTION_CONTROL_ENABLED',
    );

    if (isEnabled && ['0', 'false', 'no'].includes(isEnabled.toLowerCase())) {
      return false;
    }

    return Boolean(
      this.configService.get<string>('RUNPOD_API_KEY') &&
        this.configService.get<string>(
          'RUNPOD_KLING_V26_STD_MOTION_CONTROL_ENDPOINT_ID',
        ),
    );
  }
}
