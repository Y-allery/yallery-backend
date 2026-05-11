import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';
import {
  RUNPOD_MEDIA_ROUTE_CATALOG,
  MediaRouteCatalogEntry,
} from 'src/modules/media-generation/infrastructure/routing/media-route.catalog';
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

  const asyncRoutes = RUNPOD_MEDIA_ROUTE_CATALOG.filter(
    (route) => route.routeType !== 'imageEdit',
  );

  it('declares explicit timeout settings for every async RunPod route', () => {
    expect(asyncRoutes).toHaveLength(7);

    for (const route of asyncRoutes) {
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

  it('does not define an async status timeout for Qwen runsync', async () => {
    const { service } = createService();
    const qwenRoute = RUNPOD_MEDIA_ROUTE_CATALOG.find(
      (route): route is MediaRouteCatalogEntry =>
        route.aiService === 'qwen_image_edit_baked',
    );

    expect(qwenRoute?.statusTimeoutConfigKey).toBeUndefined();
    await expect(
      service.getStatusTimeoutMs('qwen_image_edit_baked', 'imageEdit'),
    ).rejects.toThrow(
      'RunPod status timeout is not configured for qwen_image_edit_baked',
    );
  });
});
