import { MEDIA_AUDIO_GENERATION_QUEUE } from 'src/modules/media-generation/infrastructure/queues/constants/media-generation.queue';
import { MediaCapability } from 'src/modules/media-generation/domain/enums/media-capability.enum';
import { MediaProvider } from 'src/modules/media-generation/domain/enums/media-provider.enum';
import { MediaRouteResolverService } from 'src/modules/media-generation/infrastructure/routing/media-route-resolver.service';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';

describe('MediaRouteResolverService', () => {
  const createService = (values: Record<string, string | undefined>) => {
    const providerRuntimeConfigService = {
      getString: jest.fn(async (key: string) => values[key] ?? null),
      getBoolean: jest.fn(async (key: string, fallback = true) => {
        const value = values[key];
        if (value === undefined) {
          return fallback;
        }
        return !['0', 'false', 'no', 'off'].includes(value.toLowerCase());
      }),
    } as unknown as ProviderRuntimeConfigService;

    return new MediaRouteResolverService(providerRuntimeConfigService);
  };

  it('resolves active RunPod routes from the catalog', async () => {
    const service = createService({
      RUNPOD_API_KEY: 'key',
      RUNPOD_MMAUDIO_ENDPOINT_ID: 'mmaudio-endpoint',
    });

    await expect(service.resolveAudioRoute('mmaudio_v2')).resolves.toMatchObject({
      aiService: 'mmaudio_v2',
      capability: MediaCapability.AUDIO_GENERATE,
      provider: MediaProvider.RUNPOD,
      endpointId: 'mmaudio-endpoint',
      queueName: MEDIA_AUDIO_GENERATION_QUEUE,
    });
  });

  it('disables routes with explicit false flags', async () => {
    const service = createService({
      RUNPOD_API_KEY: 'key',
      RUNPOD_MMAUDIO_ENDPOINT_ID: 'mmaudio-endpoint',
      RUNPOD_MMAUDIO_ENABLED: 'false',
    });

    await expect(service.resolveAudioRoute('mmaudio_v2')).resolves.toBeNull();
  });

  it('describes only enabled routes', async () => {
    const service = createService({
      RUNPOD_API_KEY: 'key',
      RUNPOD_MMAUDIO_ENDPOINT_ID: 'mmaudio-endpoint',
      RUNPOD_SDXL_ENDPOINT_ID: 'sdxl-endpoint',
    });

    await expect(service.describeRoutes()).resolves.toHaveLength(2);
  });

  it('does not cross-resolve text and image video routes', async () => {
    const service = createService({
      RUNPOD_API_KEY: 'key',
      RUNPOD_P_VIDEO_ENDPOINT_ID: 'p-video-endpoint',
    });

    await expect(service.resolveTextVideoRoute('p_video_image')).resolves.toBeNull();
    await expect(service.resolveImageVideoRoute('p_video_text')).resolves.toBeNull();
  });
});
