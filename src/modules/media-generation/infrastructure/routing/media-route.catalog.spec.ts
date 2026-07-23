import { RUNPOD_MEDIA_ROUTE_CATALOG } from './media-route.catalog';

describe('RUNPOD_MEDIA_ROUTE_CATALOG', () => {
  it('routes Z-Image-Turbo through the video RunPod account key', () => {
    const route = RUNPOD_MEDIA_ROUTE_CATALOG.find(
      (entry) => entry.aiService === 'z_image_turbo',
    );

    expect(route).toBeDefined();
    expect(route?.endpointConfigKey).toBe(
      'RUNPOD_Z_IMAGE_TURBO_ENDPOINT_ID',
    );
    expect(route?.apiKeyConfigKey).toBe('RUNPOD_VIDEO_API_KEY');
  });

  it('keeps the existing Qwen image route on the video account key', () => {
    const route = RUNPOD_MEDIA_ROUTE_CATALOG.find(
      (entry) => entry.aiService === 'qwen_image',
    );

    expect(route?.apiKeyConfigKey).toBe('RUNPOD_VIDEO_API_KEY');
  });
});
