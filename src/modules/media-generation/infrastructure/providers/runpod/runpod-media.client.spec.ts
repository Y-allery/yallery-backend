import { GatewayTimeoutException } from '@nestjs/common';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';
import { RunpodMediaClient } from './runpod-media.client';

describe('RunpodMediaClient', () => {
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
});
