import { ConfigService } from '@nestjs/config';
import { MEDIA_AUDIO_GENERATION_QUEUE } from 'src/modules/media-generation/infrastructure/queues/constants/media-generation.queue';
import { MediaCapability } from 'src/modules/media-generation/domain/enums/media-capability.enum';
import { MediaProvider } from 'src/modules/media-generation/domain/enums/media-provider.enum';
import { MediaRouteResolverService } from 'src/modules/media-generation/infrastructure/routing/media-route-resolver.service';

describe('MediaRouteResolverService', () => {
  const createService = (values: Record<string, string | undefined>) => {
    const configService = {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;

    return new MediaRouteResolverService(configService);
  };

  it('resolves active RunPod routes from the catalog', () => {
    const service = createService({
      RUNPOD_API_KEY: 'key',
      RUNPOD_MMAUDIO_ENDPOINT_ID: 'mmaudio-endpoint',
    });

    expect(service.resolveAudioRoute('mmaudio_v2')).toMatchObject({
      aiService: 'mmaudio_v2',
      capability: MediaCapability.AUDIO_GENERATE,
      provider: MediaProvider.RUNPOD,
      endpointId: 'mmaudio-endpoint',
      queueName: MEDIA_AUDIO_GENERATION_QUEUE,
    });
  });

  it('disables routes with explicit false flags', () => {
    const service = createService({
      RUNPOD_API_KEY: 'key',
      RUNPOD_MMAUDIO_ENDPOINT_ID: 'mmaudio-endpoint',
      RUNPOD_MMAUDIO_ENABLED: 'false',
    });

    expect(service.resolveAudioRoute('mmaudio_v2')).toBeNull();
  });

  it('describes only enabled routes', () => {
    const service = createService({
      RUNPOD_API_KEY: 'key',
      RUNPOD_MMAUDIO_ENDPOINT_ID: 'mmaudio-endpoint',
      RUNPOD_SDXL_ENDPOINT_ID: 'sdxl-endpoint',
    });

    expect(service.describeRoutes()).toHaveLength(2);
  });

  it('does not cross-resolve text and image video routes', () => {
    const service = createService({
      RUNPOD_API_KEY: 'key',
      RUNPOD_P_VIDEO_ENDPOINT_ID: 'p-video-endpoint',
    });

    expect(service.resolveTextVideoRoute('p_video_image')).toBeNull();
    expect(service.resolveImageVideoRoute('p_video_text')).toBeNull();
  });
});
