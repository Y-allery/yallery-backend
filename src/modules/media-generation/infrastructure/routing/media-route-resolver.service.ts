import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MEDIA_AUDIO_GENERATION_QUEUE,
  MEDIA_IMAGE_EDIT_GENERATION_QUEUE,
  MEDIA_IMAGE_VIDEO_GENERATION_QUEUE,
  MEDIA_MEME_GENERATION_QUEUE,
  MEDIA_TEXT_VIDEO_GENERATION_QUEUE,
  RUNPOD_IMAGE_GENERATION_QUEUE,
} from 'src/modules/media-generation/infrastructure/queues/constants/media-generation.queue';
import { MediaGenerationRoute } from 'src/modules/media-generation/domain/contracts/media-generation-route.contract';
import { MediaCapability } from 'src/modules/media-generation/domain/enums/media-capability.enum';
import { MediaDispatch } from 'src/modules/media-generation/domain/enums/media-dispatch.enum';
import { MediaProvider } from 'src/modules/media-generation/domain/enums/media-provider.enum';

interface MediaRouteCatalogEntry {
  routeType:
    | 'promptImage'
    | 'imageEdit'
    | 'audio'
    | 'textVideo'
    | 'imageVideo'
    | 'meme';
  aiService: string;
  capability: MediaCapability;
  provider: MediaProvider;
  dispatch: MediaDispatch;
  queueName: string;
  endpointConfigKey: string;
  enabledConfigKey?: string;
}

@Injectable()
export class MediaRouteResolverService {
  private readonly routeCatalog: MediaRouteCatalogEntry[] = [
    {
      routeType: 'promptImage',
      aiService: 'flux2_klein',
      capability: MediaCapability.IMAGE_GENERATE,
      provider: MediaProvider.RUNPOD,
      dispatch: MediaDispatch.BULLMQ_QUEUE,
      queueName: RUNPOD_IMAGE_GENERATION_QUEUE,
      endpointConfigKey: 'RUNPOD_FLUX2_KLEIN_ENDPOINT_ID',
      enabledConfigKey: 'RUNPOD_FLUX2_KLEIN_ENABLED',
    },
    {
      routeType: 'promptImage',
      aiService: 'sdxl',
      capability: MediaCapability.IMAGE_GENERATE,
      provider: MediaProvider.RUNPOD,
      dispatch: MediaDispatch.BULLMQ_QUEUE,
      queueName: RUNPOD_IMAGE_GENERATION_QUEUE,
      endpointConfigKey: 'RUNPOD_SDXL_ENDPOINT_ID',
      enabledConfigKey: 'RUNPOD_SDXL_ENABLED',
    },
    {
      routeType: 'promptImage',
      aiService: 'sdxl_lora_generation',
      capability: MediaCapability.IMAGE_GENERATE,
      provider: MediaProvider.RUNPOD,
      dispatch: MediaDispatch.BULLMQ_QUEUE,
      queueName: RUNPOD_IMAGE_GENERATION_QUEUE,
      endpointConfigKey: 'RUNPOD_SDXL_LORA_GENERATION_ENDPOINT_ID',
      enabledConfigKey: 'RUNPOD_SDXL_LORA_GENERATION_ENABLED',
    },
    {
      routeType: 'imageEdit',
      aiService: 'qwen_image_edit_baked',
      capability: MediaCapability.IMAGE_EDIT,
      provider: MediaProvider.RUNPOD,
      dispatch: MediaDispatch.BULLMQ_QUEUE,
      queueName: MEDIA_IMAGE_EDIT_GENERATION_QUEUE,
      endpointConfigKey: 'RUNPOD_QWEN_IMAGE_EDIT_BAKED_ENDPOINT_ID',
      enabledConfigKey: 'RUNPOD_QWEN_IMAGE_EDIT_BAKED_ENABLED',
    },
    {
      routeType: 'audio',
      aiService: 'mmaudio_v2',
      capability: MediaCapability.AUDIO_GENERATE,
      provider: MediaProvider.RUNPOD,
      dispatch: MediaDispatch.BULLMQ_QUEUE,
      queueName: MEDIA_AUDIO_GENERATION_QUEUE,
      endpointConfigKey: 'RUNPOD_MMAUDIO_ENDPOINT_ID',
      enabledConfigKey: 'RUNPOD_MMAUDIO_ENABLED',
    },
    {
      routeType: 'textVideo',
      aiService: 'p_video_text',
      capability: MediaCapability.VIDEO_GENERATE,
      provider: MediaProvider.RUNPOD,
      dispatch: MediaDispatch.BULLMQ_QUEUE,
      queueName: MEDIA_TEXT_VIDEO_GENERATION_QUEUE,
      endpointConfigKey: 'RUNPOD_P_VIDEO_ENDPOINT_ID',
      enabledConfigKey: 'RUNPOD_P_VIDEO_ENABLED',
    },
    {
      routeType: 'imageVideo',
      aiService: 'p_video_image',
      capability: MediaCapability.VIDEO_GENERATE,
      provider: MediaProvider.RUNPOD,
      dispatch: MediaDispatch.BULLMQ_QUEUE,
      queueName: MEDIA_IMAGE_VIDEO_GENERATION_QUEUE,
      endpointConfigKey: 'RUNPOD_P_VIDEO_ENDPOINT_ID',
      enabledConfigKey: 'RUNPOD_P_VIDEO_ENABLED',
    },
    {
      routeType: 'meme',
      aiService: 'wan22_animate_native',
      capability: MediaCapability.MEME_GENERATE,
      provider: MediaProvider.RUNPOD,
      dispatch: MediaDispatch.BULLMQ_QUEUE,
      queueName: MEDIA_MEME_GENERATION_QUEUE,
      endpointConfigKey: 'RUNPOD_WAN22_ANIMATE_MEME_ENDPOINT_ID',
      enabledConfigKey: 'RUNPOD_WAN22_ANIMATE_MEME_ENABLED',
    },
  ];

  constructor(private readonly configService: ConfigService) {}

  resolvePromptImageRoute(aiService: string): MediaGenerationRoute | null {
    return this.resolveRoute(aiService, 'promptImage');
  }

  resolveImageEditRoute(aiService: string): MediaGenerationRoute | null {
    return this.resolveRoute(aiService, 'imageEdit');
  }

  resolveAudioRoute(aiService: string): MediaGenerationRoute | null {
    return this.resolveRoute(aiService, 'audio');
  }

  resolveTextVideoRoute(aiService: string): MediaGenerationRoute | null {
    return this.resolveRoute(aiService, 'textVideo');
  }

  resolveImageVideoRoute(aiService: string): MediaGenerationRoute | null {
    return this.resolveRoute(aiService, 'imageVideo');
  }

  resolveMemeRoute(aiService: string): MediaGenerationRoute | null {
    return this.resolveRoute(aiService, 'meme');
  }

  describeRoutes() {
    return this.routeCatalog
      .map((entry) => this.resolveRoute(entry.aiService, entry.routeType))
      .filter(Boolean);
  }

  private resolveRoute(
    aiService: string,
    routeType: MediaRouteCatalogEntry['routeType'],
  ): MediaGenerationRoute | null {
    const entry = this.routeCatalog.find(
      (route) => route.aiService === aiService && route.routeType === routeType,
    );

    if (!entry || !this.isRouteEnabled(entry)) {
      return null;
    }

    return {
      capability: entry.capability,
      provider: entry.provider,
      dispatch: entry.dispatch,
      aiService: entry.aiService,
      endpointId: this.configService.get<string>(entry.endpointConfigKey),
      queueName: entry.queueName,
    };
  }

  private isRouteEnabled(entry: MediaRouteCatalogEntry): boolean {
    const isEnabled = entry.enabledConfigKey
      ? this.configService.get<string>(entry.enabledConfigKey)
      : undefined;

    if (isEnabled && ['0', 'false', 'no'].includes(isEnabled.toLowerCase())) {
      return false;
    }

    return Boolean(
      this.configService.get<string>('RUNPOD_API_KEY') &&
        this.configService.get<string>(entry.endpointConfigKey),
    );
  }
}
