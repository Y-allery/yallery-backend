import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { ProviderRuntimeSettingEntity } from './entities/provider-runtime-setting.entity';
import { ProviderRuntimeConfigService } from './provider-runtime-config.service';

jest.mock('axios');

describe('ProviderRuntimeConfigService', () => {
  const createService = (env: Record<string, string> = {}) => {
    const rows = new Map<string, ProviderRuntimeSettingEntity>();
    let nextId = 1;

    const repository = {
      find: jest.fn(async () => [...rows.values()]),
      findOne: jest.fn(async ({ where: { key } }) => rows.get(key) ?? null),
      create: jest.fn(() => new ProviderRuntimeSettingEntity()),
      save: jest.fn(async (row: ProviderRuntimeSettingEntity) => {
        if (!row.id) {
          row.id = nextId++;
          row.createdAt = new Date();
        }
        row.updatedAt = new Date();
        rows.set(row.key, row);
        return row;
      }),
      delete: jest.fn(async ({ key }) => {
        rows.delete(key);
        return { affected: 1 };
      }),
    };

    const configService = {
      get: jest.fn((key: string) => env[key]),
    } as unknown as ConfigService;

    return {
      service: new ProviderRuntimeConfigService(
        repository as any,
        configService,
      ),
      rows,
      repository,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('encrypts secret values and never returns plaintext secrets', async () => {
    const { service, rows } = createService({
      SETTINGS_ENCRYPTION_KEY: 'test-encryption-secret',
    });

    const response = await service.updateSetting('OPENAI_API_KEY', {
      value: 'sk-test-secret',
    });
    const stored = rows.get('OPENAI_API_KEY');
    const list = await service.listSettings();
    const listedSecret = list.all.find((item) => item.key === 'OPENAI_API_KEY');

    expect(stored?.valueEncrypted).toBeTruthy();
    expect(stored?.valueEncrypted).not.toContain('sk-test-secret');
    expect(response.value).toBeUndefined();
    expect(response.maskedValue).toBe('sk-t...cret');
    expect(listedSecret.value).toBeUndefined();
    expect(JSON.stringify(listedSecret)).not.toContain('sk-test-secret');
  });

  it('prefers DB overrides and falls back to env after clearing', async () => {
    const { service } = createService({
      RUNPOD_MMAUDIO_ENDPOINT_ID: 'env-endpoint',
    });

    expect(await service.getString('RUNPOD_MMAUDIO_ENDPOINT_ID')).toBe(
      'env-endpoint',
    );

    await service.updateSetting('RUNPOD_MMAUDIO_ENDPOINT_ID', {
      value: 'db-endpoint',
    });
    expect(await service.getString('RUNPOD_MMAUDIO_ENDPOINT_ID')).toBe(
      'db-endpoint',
    );

    await service.clearSetting('RUNPOD_MMAUDIO_ENDPOINT_ID');
    expect(await service.getString('RUNPOD_MMAUDIO_ENDPOINT_ID')).toBe(
      'env-endpoint',
    );
  });

  it('caches per-key row lookups (including misses) within the TTL', async () => {
    const { service, repository } = createService({
      RUNPOD_MMAUDIO_ENDPOINT_ID: 'env-endpoint',
    });

    expect(await service.getString('RUNPOD_MMAUDIO_ENDPOINT_ID')).toBe(
      'env-endpoint',
    );
    expect(await service.getString('RUNPOD_MMAUDIO_ENDPOINT_ID')).toBe(
      'env-endpoint',
    );
    expect(repository.findOne).toHaveBeenCalledTimes(1);
  });

  it('invalidates the cache on update and clear', async () => {
    const { service } = createService({
      RUNPOD_MMAUDIO_ENDPOINT_ID: 'env-endpoint',
    });

    // Prime the cache with a miss.
    expect(await service.getString('RUNPOD_MMAUDIO_ENDPOINT_ID')).toBe(
      'env-endpoint',
    );

    await service.updateSetting('RUNPOD_MMAUDIO_ENDPOINT_ID', {
      value: 'db-endpoint',
    });
    expect(await service.getString('RUNPOD_MMAUDIO_ENDPOINT_ID')).toBe(
      'db-endpoint',
    );

    await service.clearSetting('RUNPOD_MMAUDIO_ENDPOINT_ID');
    expect(await service.getString('RUNPOD_MMAUDIO_ENDPOINT_ID')).toBe(
      'env-endpoint',
    );
  });

  it('bypasses the cache when validating a setting', async () => {
    const { service, rows } = createService({});

    // Prime the cache with a miss for the key.
    expect(await service.getString('RUNPOD_P_VIDEO_ENDPOINT_ID')).toBeNull();

    // Simulate a DB change the service did not observe (no invalidation).
    const row = new ProviderRuntimeSettingEntity();
    row.key = 'RUNPOD_P_VIDEO_ENDPOINT_ID';
    row.isSecret = false;
    row.valuePlain = 'p-video';
    rows.set(row.key, row);

    // Cached miss still served on the hot path.
    expect(await service.getString('RUNPOD_P_VIDEO_ENDPOINT_ID')).toBeNull();

    // Validation reads fresh and repopulates the cache.
    await expect(
      service.validateSetting('RUNPOD_P_VIDEO_ENDPOINT_ID'),
    ).resolves.toMatchObject({ ok: true, status: 'configured' });
    expect(await service.getString('RUNPOD_P_VIDEO_ENDPOINT_ID')).toBe(
      'p-video',
    );
  });

  it('validates p-video as a public endpoint without control-plane lookup', async () => {
    const { service } = createService({
      RUNPOD_P_VIDEO_ENDPOINT_ID: 'p-video',
    });

    await expect(
      service.validateSetting('RUNPOD_P_VIDEO_ENDPOINT_ID'),
    ).resolves.toMatchObject({
      ok: true,
      status: 'configured',
    });
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('validates private RunPod endpoints through the control plane', async () => {
    (axios.get as jest.Mock).mockResolvedValueOnce({
      data: {
        id: 'endpoint-id',
        name: 'endpoint-name',
        workersMax: 2,
        idleTimeout: 300,
      },
    });
    const { service } = createService({
      RUNPOD_API_KEY: 'runpod-key',
      RUNPOD_MMAUDIO_ENDPOINT_ID: 'endpoint-id',
    });

    await expect(
      service.validateSetting('RUNPOD_MMAUDIO_ENDPOINT_ID'),
    ).resolves.toMatchObject({
      ok: true,
      status: 'valid',
      details: {
        id: 'endpoint-id',
        name: 'endpoint-name',
      },
    });
    expect(axios.get).toHaveBeenCalledWith(
      'https://rest.runpod.io/v1/endpoints/endpoint-id',
      expect.objectContaining({
        headers: { Authorization: 'Bearer runpod-key' },
      }),
    );
  });

  it('validates cross-account endpoints with the route-specific API key', async () => {
    (axios.get as jest.Mock).mockResolvedValueOnce({
      data: {
        id: 'z-image-endpoint',
        name: 'z-image-turbo-prod',
        workersMax: 3,
        idleTimeout: 5,
      },
    });
    const { service } = createService({
      RUNPOD_API_KEY: 'main-runpod-key',
      RUNPOD_VIDEO_API_KEY: 'video-runpod-key',
      RUNPOD_Z_IMAGE_TURBO_ENDPOINT_ID: 'z-image-endpoint',
    });

    await expect(
      service.validateSetting('RUNPOD_Z_IMAGE_TURBO_ENDPOINT_ID'),
    ).resolves.toMatchObject({
      ok: true,
      status: 'valid',
      details: {
        id: 'z-image-endpoint',
        name: 'z-image-turbo-prod',
      },
    });
    expect(axios.get).toHaveBeenCalledWith(
      'https://rest.runpod.io/v1/endpoints/z-image-endpoint',
      expect.objectContaining({
        headers: { Authorization: 'Bearer video-runpod-key' },
      }),
    );
  });
});
