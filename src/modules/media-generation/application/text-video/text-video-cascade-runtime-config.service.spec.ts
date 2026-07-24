import {
  LTX_TEXT_CASCADE_RUNPOD_API_KEY_CONFIG_KEY,
  TEXT_VIDEO_CASCADE_SETTING_KEYS,
} from 'src/modules/media-generation/domain/contracts/text-video-cascade-settings.contract';
import { PROVIDER_SETTING_DEFINITIONS } from 'src/modules/provider-settings/provider-settings.catalog';
import { TextVideoCascadeRuntimeConfigService } from './text-video-cascade-runtime-config.service';

function createService(values: Record<string, string | number | boolean> = {}) {
  const config = {
    getBoolean: jest.fn(async (key: string, fallback?: boolean) => {
      const value = values[key];
      return typeof value === 'boolean' ? value : (fallback ?? false);
    }),
    getString: jest.fn(async (key: string) => {
      const value = values[key];
      return typeof value === 'string' ? value : null;
    }),
    getStringFresh: jest.fn(async (key: string) => {
      const value = values[key];
      return typeof value === 'string' ? value : null;
    }),
    getNumber: jest.fn(async (key: string, fallback?: number) => {
      const value = values[key];
      return typeof value === 'number' ? value : fallback;
    }),
  };
  return {
    service: new TextVideoCascadeRuntimeConfigService(config as any),
    config,
  };
}

describe('TextVideoCascadeRuntimeConfigService', () => {
  it('keeps cascade RunPod readiness false when its dedicated route is absent', async () => {
    const { service } = createService({
      LTX_TEXT_CASCADE_ENABLED: true,
      RUNPOD_P_VIDEO_ENDPOINT_ID: 'native_endpoint_12345678',
    });

    await expect(service.getRuntimeSnapshot()).resolves.toMatchObject({
      enabled: true,
      cascadeRunpodEndpointId: 'unconfigured',
      cascadeRunpodApiKeyConfigKey: LTX_TEXT_CASCADE_RUNPOD_API_KEY_CONFIG_KEY,
      cascadeRunpodReady: false,
    });
  });

  it('rejects silent reuse of the native endpoint', async () => {
    const { service } = createService({
      LTX_TEXT_CASCADE_RUNPOD_ENDPOINT_ID: 'shared_endpoint_12345678',
      LTX_TEXT_CASCADE_RUNPOD_API_KEY: 'dedicated-test-key',
      RUNPOD_P_VIDEO_ENDPOINT_ID: 'shared_endpoint_12345678',
    });

    await expect(service.getRuntimeSnapshot()).resolves.toMatchObject({
      cascadeRunpodEndpointId: 'shared_endpoint_12345678',
      cascadeRunpodReady: false,
    });
  });

  it('pins a separately configured cascade endpoint and dedicated key reference', async () => {
    const { service, config } = createService({
      LTX_TEXT_CASCADE_RUNPOD_ENDPOINT_ID: 'cascade_endpoint_12345678',
      LTX_TEXT_CASCADE_RUNPOD_API_KEY: 'dedicated-test-key',
      RUNPOD_P_VIDEO_ENDPOINT_ID: 'native_endpoint_12345678',
    });

    await expect(service.getRuntimeSnapshot()).resolves.toMatchObject({
      cascadeRunpodEndpointId: 'cascade_endpoint_12345678',
      cascadeRunpodApiKeyConfigKey: LTX_TEXT_CASCADE_RUNPOD_API_KEY_CONFIG_KEY,
      cascadeRunpodReady: true,
    });
    expect(config.getStringFresh).toHaveBeenCalledWith(
      TEXT_VIDEO_CASCADE_SETTING_KEYS.cascadeRunpodEndpointId,
    );
    expect(config.getStringFresh).toHaveBeenCalledWith(
      TEXT_VIDEO_CASCADE_SETTING_KEYS.cascadeRunpodApiKey,
    );
  });

  it('fails closed when the Pruna secret is absent', async () => {
    const { service } = createService();

    await expect(service.getPrunaClientConfig()).rejects.toEqual(
      expect.objectContaining({
        reasonCode: 'PRUNA_NOT_CONFIGURED',
      }),
    );
  });

  it('snapshots a canonical non-secret Pruna client policy digest', async () => {
    const values = {
      LTX_TEXT_CASCADE_CONFIG_VERSION: 'cascade-v1',
      PRUNA_API_BASE_URL: 'https://api.pruna.ai',
      PRUNA_P_IMAGE_ALLOWED_DOWNLOAD_HOSTS:
        'SECOND.pruna.test, delivery.pruna.test, second.pruna.test',
      PRUNA_P_IMAGE_SUBMIT_TIMEOUT_MS: 11_000,
      PRUNA_P_IMAGE_STATUS_REQUEST_TIMEOUT_MS: 6_000,
      PRUNA_P_IMAGE_DOWNLOAD_TIMEOUT_MS: 12_000,
      PRUNA_P_IMAGE_MAX_SOURCE_BYTES: 5 * 1024 * 1024,
    };
    const first = await createService(values).service.getRuntimeSnapshot();
    const reordered = await createService({
      ...values,
      PRUNA_P_IMAGE_ALLOWED_DOWNLOAD_HOSTS:
        'delivery.pruna.test,second.pruna.test',
    }).service.getRuntimeSnapshot();

    expect(first).toMatchObject({
      pipelineConfigVersion: 'cascade-v1',
      prunaClientPolicySha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(first.prunaClientPolicySha256).toBe(
      reordered.prunaClientPolicySha256,
    );
  });

  it('returns the same resolved policy values used by the digest and client', async () => {
    const { service } = createService({
      PRUNA_API_KEY: 'unit-test-key',
      PRUNA_P_IMAGE_ALLOWED_DOWNLOAD_HOSTS: 'delivery.pruna.test',
    });

    await expect(service.getPrunaClientConfig()).resolves.toMatchObject({
      apiKey: 'unit-test-key',
      apiBaseUrl: 'https://api.pruna.ai',
      allowedDownloadHosts: ['delivery.pruna.test'],
      maxJsonResponseBytes: 1024 * 1024,
      maxSourceJpegBytes: 6 * 1024 * 1024,
      statusGetRetries: 3,
      downloadGetRetries: 3,
      getRetryBaseDelayMs: 250,
    });
  });
});

describe('text-video cascade provider settings catalog', () => {
  it('marks provider keys secret and readiness switches disabled by default', () => {
    const definitions = new Map(
      PROVIDER_SETTING_DEFINITIONS.map((definition) => [
        definition.key,
        definition,
      ]),
    );

    expect(definitions.get('PRUNA_API_KEY')).toMatchObject({
      provider: 'pruna',
      isSecret: true,
      type: 'secret',
    });
    expect(
      definitions.get(LTX_TEXT_CASCADE_RUNPOD_API_KEY_CONFIG_KEY),
    ).toMatchObject({
      provider: 'runpod',
      isSecret: true,
      type: 'secret',
    });
    expect(definitions.get('LTX_TEXT_CASCADE_ENABLED')).toMatchObject({
      defaultValue: 'false',
    });
    expect(definitions.get('PRUNA_P_IMAGE_ENABLED')).toMatchObject({
      defaultValue: 'false',
    });
    expect(
      definitions.get('LTX_TEXT_CASCADE_RUNPOD_ENDPOINT_ID'),
    ).toMatchObject({
      validationKind: 'runpod_serverless_endpoint',
      apiKeyConfigKey: LTX_TEXT_CASCADE_RUNPOD_API_KEY_CONFIG_KEY,
    });
  });
});
