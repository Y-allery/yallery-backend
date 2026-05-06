import { Injectable } from '@nestjs/common';
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
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';

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

  constructor(
    private readonly providerRuntimeConfigService: ProviderRuntimeConfigService,
  ) {}

  resolvePromptImageRoute(aiService: string): Promise<MediaGenerationRoute | null> {
    return this.resolveRoute(aiService, 'promptImage');
  }

  resolveImageEditRoute(aiService: string): Promise<MediaGenerationRoute | null> {
    return this.resolveRoute(aiService, 'imageEdit');
  }

  resolveAudioRoute(aiService: string): Promise<MediaGenerationRoute | null> {
    return this.resolveRoute(aiService, 'audio');
  }

  resolveTextVideoRoute(aiService: string): Promise<MediaGenerationRoute | null> {
    return this.resolveRoute(aiService, 'textVideo');
  }

  resolveImageVideoRoute(aiService: string): Promise<MediaGenerationRoute | null> {
    return this.resolveRoute(aiService, 'imageVideo');
  }

  resolveMemeRoute(aiService: string): Promise<MediaGenerationRoute | null> {
    return this.resolveRoute(aiService, 'meme');
  }

  async describeRoutes() {
    const routes = await Promise.all(
      this.routeCatalog.map((entry) =>
        this.resolveRoute(entry.aiService, entry.routeType),
      ),
    );

    return routes.filter(Boolean);
  }

  private async resolveRoute(
    aiService: string,
    routeType: MediaRouteCatalogEntry['routeType'],
  ): Promise<MediaGenerationRoute | null> {
    const entry = this.routeCatalog.find(
      (route) => route.aiService === aiService && route.routeType === routeType,
    );

    if (!entry || !(await this.isRouteEnabled(entry))) {
      return null;
    }

    const endpointId = await this.providerRuntimeConfigService.getString(
      entry.endpointConfigKey,
    );

    return {
      capability: entry.capability,
      provider: entry.provider,
      dispatch: entry.dispatch,
      aiService: entry.aiService,
      endpointId,
      queueName: entry.queueName,
    };
  }

  private async isRouteEnabled(entry: MediaRouteCatalogEntry): Promise<boolean> {
    const isEnabled = entry.enabledConfigKey
      ? await this.providerRuntimeConfigService.getBoolean(
          entry.enabledConfigKey,
          true,
        )
      : true;

    if (!isEnabled) {
      return false;
    }

    const [apiKey, endpointId] = await Promise.all([
      this.providerRuntimeConfigService.getString('RUNPOD_API_KEY'),
      this.providerRuntimeConfigService.getString(entry.endpointConfigKey),
    ]);

    return Boolean(apiKey && endpointId);
  }
}
