import {
  PrunaPImageClient,
  prunaPImageClientPolicySha256,
} from './pruna-p-image.client';
import { PrunaPImageRuntimeClient } from './pruna-p-image-runtime.client';
import {
  PrunaDownloadedJpeg,
  PrunaPImageClientConfig,
  PrunaPImageGenerationInput,
  PrunaPredictionStatus,
  PrunaStillSubmission,
} from './pruna-p-image.types';

const PREDICTION_ID = 'prediction_12345678';
const GENERATION_INPUT: PrunaPImageGenerationInput = {
  prompt: 'One dancer turns slowly in an empty studio.',
  width: 1280,
  height: 704,
  seed: 43103,
};

function config(
  overrides: Partial<PrunaPImageClientConfig> = {},
): PrunaPImageClientConfig {
  return {
    apiKey: 'unit-test-pruna-key',
    pipelineConfigVersion: 'cascade-v1',
    apiBaseUrl: 'https://api.pruna.ai',
    allowedDownloadHosts: ['delivery.pruna.test'],
    submitTimeoutMs: 10_000,
    statusRequestTimeoutMs: 5_000,
    downloadTimeoutMs: 10_000,
    maxJsonResponseBytes: 1024 * 1024,
    maxSourceJpegBytes: 6 * 1024 * 1024,
    statusGetRetries: 3,
    downloadGetRetries: 3,
    getRetryBaseDelayMs: 250,
    ...overrides,
  };
}

class FakePrunaClient {
  readonly externalCalls: string[] = [];

  async submit(
    _input: PrunaPImageGenerationInput,
  ): Promise<PrunaStillSubmission> {
    this.externalCalls.push('submit');
    return {
      certainty: 'accepted',
      predictionId: PREDICTION_ID,
      requestHash: 'a'.repeat(64),
    };
  }

  async getStatus(_predictionId: string): Promise<PrunaPredictionStatus> {
    this.externalCalls.push('status');
    return { status: 'processing' };
  }

  async downloadSucceededJpeg(
    _predictionId: string,
  ): Promise<PrunaDownloadedJpeg> {
    this.externalCalls.push('download');
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    return {
      bytes,
      mime: 'image/jpeg',
      byteLength: bytes.byteLength,
      sha256: 'b'.repeat(64),
    };
  }
}

class TestPrunaPImageRuntimeClient extends PrunaPImageRuntimeClient {
  readonly clients: FakePrunaClient[] = [];

  protected createClient(_config: PrunaPImageClientConfig): PrunaPImageClient {
    const client = new FakePrunaClient();
    this.clients.push(client);
    return client as unknown as PrunaPImageClient;
  }

  get externalCalls(): string[] {
    return this.clients.flatMap((client) => client.externalCalls);
  }
}

function harness(initial: PrunaPImageClientConfig = config()) {
  let current = initial;
  const runtimeConfig = {
    getPrunaClientConfig: jest.fn(async () => ({ ...current })),
  };
  const client = new TestPrunaPImageRuntimeClient(runtimeConfig as never);
  return {
    client,
    setConfig(next: PrunaPImageClientConfig) {
      current = next;
    },
  };
}

describe('PrunaPImageRuntimeClient immutable workflow policy', () => {
  it('allows submit, status and download while the resolved policy is stable', async () => {
    const current = config();
    const expected = prunaPImageClientPolicySha256(current);
    const { client } = harness(current);

    await expect(
      client.submit(GENERATION_INPUT, expected),
    ).resolves.toMatchObject({ certainty: 'accepted' });
    await expect(client.getStatus(PREDICTION_ID, expected)).resolves.toEqual({
      status: 'processing',
    });
    await expect(
      client.downloadSucceededJpeg(PREDICTION_ID, expected),
    ).resolves.toMatchObject({ mime: 'image/jpeg' });

    expect(client.externalCalls).toEqual(['submit', 'status', 'download']);
    expect(client.clients).toHaveLength(1);
  });

  it.each([
    [
      'allowlist',
      (baseline: PrunaPImageClientConfig) => ({
        ...baseline,
        allowedDownloadHosts: [
          ...baseline.allowedDownloadHosts,
          'other.pruna.test',
        ],
      }),
    ],
    [
      'source cap',
      (baseline: PrunaPImageClientConfig) => ({
        ...baseline,
        maxSourceJpegBytes: 7 * 1024 * 1024,
      }),
    ],
    [
      'timeout',
      (baseline: PrunaPImageClientConfig) => ({
        ...baseline,
        statusRequestTimeoutMs: 6_000,
      }),
    ],
    [
      'pipeline version',
      (baseline: PrunaPImageClientConfig) => ({
        ...baseline,
        pipelineConfigVersion: 'cascade-v2',
      }),
    ],
  ] as const)(
    'rejects resumed status before external I/O after %s drift',
    async (_, mutate) => {
      const baseline = config();
      const expected = prunaPImageClientPolicySha256(baseline);
      const state = harness(baseline);
      await state.client.submit(GENERATION_INPUT, expected);
      expect(state.client.externalCalls).toEqual(['submit']);

      state.setConfig(mutate(baseline));
      await expect(
        state.client.getStatus(PREDICTION_ID, expected),
      ).rejects.toMatchObject({
        message: 'PRUNA_CLIENT_POLICY_DRIFT',
        metadata: {
          stage: 'status',
          reasonCode: 'PRUNA_CLIENT_POLICY_DRIFT',
          retryable: false,
          certainty: 'accepted',
        },
      });
      expect(state.client.externalCalls).toEqual(['submit']);
    },
  );

  it.each(['submit', 'status', 'download'] as const)(
    'guards %s before invoking the low-level external boundary',
    async (operation) => {
      const baseline = config();
      const expected = prunaPImageClientPolicySha256(baseline);
      const state = harness(
        config({
          ...baseline,
          allowedDownloadHosts: ['changed.pruna.test'],
        }),
      );

      const action =
        operation === 'submit'
          ? state.client.submit(GENERATION_INPUT, expected)
          : operation === 'status'
            ? state.client.getStatus(PREDICTION_ID, expected)
            : state.client.downloadSucceededJpeg(PREDICTION_ID, expected);
      await expect(action).rejects.toMatchObject({
        message: 'PRUNA_CLIENT_POLICY_DRIFT',
        metadata: {
          stage: operation,
          retryable: false,
        },
      });
      expect(state.client.externalCalls).toEqual([]);
      expect(state.client.clients).toHaveLength(0);
    },
  );
});
