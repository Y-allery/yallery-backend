import { GatewayTimeoutException } from '@nestjs/common';
import axios from 'axios';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';
import { RunpodMediaClient } from './runpod-media.client';

jest.mock('axios');

describe('RunpodMediaClient', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  const createClient = () => {
    const providerRuntimeConfigService = {
      getNumber: jest.fn(),
      getString: jest.fn(),
    } as unknown as ProviderRuntimeConfigService;

    return {
      client: new RunpodMediaClient(providerRuntimeConfigService),
      providerRuntimeConfigService,
    };
  };

  beforeEach(() => jest.clearAllMocks());

  it('requires callers to provide the async status timeout explicitly', async () => {
    const { client, providerRuntimeConfigService } = createClient();

    await expect(
      client.waitForCompletion(
        'endpoint-id',
        { id: 'job-1', status: 'IN_PROGRESS' },
        () => false,
        0,
      ),
    ).rejects.toBeInstanceOf(GatewayTimeoutException);
    expect(providerRuntimeConfigService.getNumber).not.toHaveBeenCalledWith(
      'RUNPOD_STATUS_TIMEOUT_MS',
    );
  });

  it('authenticates status polling with the per-route API key', async () => {
    const { client, providerRuntimeConfigService } = createClient();
    (providerRuntimeConfigService.getString as jest.Mock).mockImplementation(
      async (key: string) =>
        key === 'RUNPOD_VIDEO_API_KEY' ? 'video-key' : null,
    );
    (providerRuntimeConfigService.getNumber as jest.Mock).mockResolvedValue(0);
    // Poll loop: initial job is IN_PROGRESS, so the first status GET drives completion.
    mockedAxios.get.mockResolvedValueOnce({
      data: { id: 'job-1', status: 'COMPLETED', output: { ok: true } },
    });

    const result = await client.waitForCompletion(
      'endpoint-id',
      { id: 'job-1', status: 'IN_PROGRESS' } as any,
      (output) => Boolean(output),
      60000,
      'RUNPOD_VIDEO_API_KEY',
    );

    expect(result.status).toBe('COMPLETED');
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.runpod.ai/v2/endpoint-id/status/job-1',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer video-key' }),
      }),
    );
  });
});
