import axios from 'axios';
import { RunpodFineTuneClient } from './runpod-finetune.client';

jest.mock('axios');

describe('RunpodFineTuneClient', () => {
  const createClient = (settings: Record<string, string>) => {
    const providerRuntimeConfigService = {
      getString: jest.fn(async (key: string) => settings[key] ?? null),
      getNumber: jest.fn(async () => 60000),
    };

    return {
      client: new RunpodFineTuneClient(providerRuntimeConfigService as any),
      providerRuntimeConfigService,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the Krea 2 endpoint and main RunPod key for jobs and status calls', async () => {
    (axios.post as jest.Mock).mockResolvedValue({
      data: { id: 'krea-job', status: 'IN_QUEUE' },
    });
    (axios.get as jest.Mock).mockResolvedValue({
      data: { id: 'krea-job', status: 'IN_PROGRESS' },
    });
    const { client, providerRuntimeConfigService } = createClient({
      RUNPOD_KREA2_LORA_FINETUNE_ENDPOINT_ID: 'krea-endpoint',
      RUNPOD_API_KEY: 'main-key',
      RUNPOD_API_BASE_URL: 'https://api.runpod.test/v2',
    });

    await client.submitJob('krea2', { modelFamily: 'krea2' });
    await client.getJobStatus('krea2', 'krea-endpoint', 'krea-job');

    expect(providerRuntimeConfigService.getString).toHaveBeenCalledWith(
      'RUNPOD_API_KEY',
    );
    expect(axios.post).toHaveBeenCalledWith(
      'https://api.runpod.test/v2/krea-endpoint/run',
      { input: { modelFamily: 'krea2' } },
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer main-key',
          'Content-Type': 'application/json',
        },
      }),
    );
    expect(axios.get).toHaveBeenCalledWith(
      'https://api.runpod.test/v2/krea-endpoint/status/krea-job',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer main-key',
          'Content-Type': 'application/json',
        },
      }),
    );
  });

  it('fails closed when the main RunPod API key is missing', async () => {
    const { client } = createClient({
      RUNPOD_KREA2_LORA_FINETUNE_ENDPOINT_ID: 'krea-endpoint',
    });

    await expect(
      client.submitJob('krea2', { modelFamily: 'krea2' }),
    ).rejects.toThrow('RUNPOD_API_KEY is not configured');
    expect(axios.post).not.toHaveBeenCalled();
  });
});
