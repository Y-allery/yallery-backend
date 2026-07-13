import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';
import { RUNPOD_MEDIA_ROUTE_CATALOG } from 'src/modules/media-generation/infrastructure/routing/media-route.catalog';
import { RunpodTimeoutPolicyService } from './runpod-timeout-policy.service';

describe('RunpodTimeoutPolicyService', () => {
  const createService = (values: Record<string, number | undefined> = {}) => {
    const providerRuntimeConfigService = {
      getNumber: jest.fn(async (key: string) => values[key]),
    } as unknown as ProviderRuntimeConfigService;

    return {
      service: new RunpodTimeoutPolicyService(providerRuntimeConfigService),
      providerRuntimeConfigService,
    };
  };

  it('declares explicit timeout settings for every RunPod route (all are async/polled)', () => {
    expect(RUNPOD_MEDIA_ROUTE_CATALOG).toHaveLength(8);

    for (const route of RUNPOD_MEDIA_ROUTE_CATALOG) {
      expect(route.statusTimeoutConfigKey).toBeTruthy();
      expect(route.defaultStatusTimeoutMs).toBeGreaterThan(0);
    }
  });

  it('uses per-route catalog defaults when no override is configured', async () => {
    const { service } = createService();

    await expect(
      service.getStatusTimeoutMs('mmaudio_v2', 'audio'),
    ).resolves.toBe(7200000);
  });

  it('uses DB/env overrides for the route-specific timeout key', async () => {
    const { service, providerRuntimeConfigService } = createService({
      RUNPOD_MMAUDIO_STATUS_TIMEOUT_MS: 12345,
    });

    await expect(
      service.getStatusTimeoutMs('mmaudio_v2', 'audio'),
    ).resolves.toBe(12345);
    expect(providerRuntimeConfigService.getNumber).toHaveBeenCalledWith(
      'RUNPOD_MMAUDIO_STATUS_TIMEOUT_MS',
    );
  });

  it('fails for unknown services instead of falling back globally', async () => {
    const { service } = createService();

    await expect(
      service.getStatusTimeoutMs('unknown_service', 'audio'),
    ).rejects.toThrow(
      'RunPod status timeout is not configured for unknown_service',
    );
  });

  it('resolves the image-edit status timeout (async /run + polling)', async () => {
    const { service } = createService();

    await expect(
      service.getStatusTimeoutMs('qwen_image_edit_baked', 'imageEdit'),
    ).resolves.toBe(1200000);
  });

  it('honors a DB/env override for the image-edit timeout key', async () => {
    const { service, providerRuntimeConfigService } = createService({
      RUNPOD_QWEN_IMAGE_EDIT_BAKED_STATUS_TIMEOUT_MS: 654321,
    });

    await expect(
      service.getStatusTimeoutMs('qwen_image_edit_baked', 'imageEdit'),
    ).resolves.toBe(654321);
    expect(providerRuntimeConfigService.getNumber).toHaveBeenCalledWith(
      'RUNPOD_QWEN_IMAGE_EDIT_BAKED_STATUS_TIMEOUT_MS',
    );
  });
});
