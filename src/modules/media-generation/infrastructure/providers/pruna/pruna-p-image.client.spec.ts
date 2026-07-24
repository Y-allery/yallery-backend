import { createHash } from 'crypto';
import {
  PrunaPImageClient,
  prunaPImageClientPolicySha256,
  resolvePrunaPImageClientPolicy,
} from './pruna-p-image.client';
import {
  PrunaHttpRequest,
  PrunaHttpResponse,
  PrunaHttpTransport,
  PrunaTransportFailure,
} from './pruna-p-image.transport';
import {
  PrunaPImageClientConfig,
  PrunaPImageClientError,
  PrunaPImageRequest,
} from './pruna-p-image.types';

const TEST_API_KEY = 'unit-test-api-key-never-log';
const TEST_PROMPT =
  'One chef holding one wok in a clean commercial kitchen, no other people.';
const PREDICTION_ID = 'prediction_12345678';
const DELIVERY_URL =
  'https://delivery.pruna.test/private/generated-output.jpg?signature=opaque';
const VALID_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9,
]);

class FakeTransport implements PrunaHttpTransport {
  readonly requests: PrunaHttpRequest[] = [];
  private readonly outcomes: Array<
    | PrunaHttpResponse
    | Error
    | ((request: PrunaHttpRequest) => PrunaHttpResponse)
  > = [];

  enqueue(
    outcome:
      | PrunaHttpResponse
      | Error
      | ((request: PrunaHttpRequest) => PrunaHttpResponse),
  ): void {
    this.outcomes.push(outcome);
  }

  async request(request: PrunaHttpRequest): Promise<PrunaHttpResponse> {
    this.requests.push(request);
    const outcome = this.outcomes.shift();
    if (!outcome) {
      throw new Error('unit test exhausted fake transport outcomes');
    }
    if (outcome instanceof Error) {
      throw outcome;
    }
    return typeof outcome === 'function' ? outcome(request) : outcome;
  }
}

describe('PrunaPImageClient', () => {
  const config = (
    overrides: Partial<PrunaPImageClientConfig> = {},
  ): PrunaPImageClientConfig => ({
    apiKey: TEST_API_KEY,
    pipelineConfigVersion: 'cascade-test-v1',
    allowedDownloadHosts: ['delivery.pruna.test'],
    statusGetRetries: 0,
    downloadGetRetries: 0,
    getRetryBaseDelayMs: 0,
    ...overrides,
  });

  const response = (
    status: number,
    body: unknown,
    headers: Record<string, string | undefined> = {
      'content-type': 'application/json',
    },
  ): PrunaHttpResponse => ({
    status,
    headers,
    body: Buffer.isBuffer(body)
      ? body
      : Buffer.from(JSON.stringify(body), 'utf8'),
  });

  const acceptedResponse = (
    request: PrunaPImageRequest,
    overrides: Record<string, unknown> = {},
  ): PrunaHttpResponse =>
    response(201, {
      id: PREDICTION_ID,
      model: 'p-image',
      input: request.input,
      get_url: `https://api.pruna.ai/v1/predictions/status/${PREDICTION_ID}`,
      ...overrides,
    });

  const generationInput = {
    prompt: TEST_PROMPT,
    width: 1280 as const,
    height: 704 as const,
    seed: 33102,
  };

  it.each([
    [1280, 704],
    [704, 1280],
  ] as const)(
    'submits the exact async P-Image body and headers for %sx%s',
    async (width, height) => {
      const transport = new FakeTransport();
      const client = new PrunaPImageClient(config(), transport);
      const expectedRequest = client.buildRequest({
        ...generationInput,
        width,
        height,
      });
      transport.enqueue(acceptedResponse(expectedRequest));

      const result = await client.submit({
        ...generationInput,
        width,
        height,
      });

      expect(result).toMatchObject({
        certainty: 'accepted',
        predictionId: PREDICTION_ID,
      });
      expect(transport.requests).toHaveLength(1);
      const submitted = transport.requests[0];
      expect(submitted.method).toBe('POST');
      expect(submitted.url).toBe('https://api.pruna.ai/v1/predictions');
      expect(submitted.redirect).toBe('manual');
      expect(submitted.headers).toEqual({
        apikey: TEST_API_KEY,
        Model: 'p-image',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      });
      expect(
        Object.keys(submitted.headers).map((name) => name.toLowerCase()),
      ).not.toContain('try-sync');
      expect(JSON.parse(submitted.body)).toEqual({
        input: {
          prompt: TEST_PROMPT,
          aspect_ratio: 'custom',
          width,
          height,
          prompt_upsampling: false,
          seed: 33102,
          disable_safety_checker: false,
        },
      });
      expect(Object.keys(JSON.parse(submitted.body).input).sort()).toEqual(
        [
          'prompt',
          'aspect_ratio',
          'width',
          'height',
          'prompt_upsampling',
          'seed',
          'disable_safety_checker',
        ].sort(),
      );
    },
  );

  it('hashes canonical request JSON with the model and config version', () => {
    const client = new PrunaPImageClient(config(), new FakeTransport());
    const request = client.buildRequest(generationInput);
    const reordered = {
      input: {
        seed: request.input.seed,
        prompt: request.input.prompt,
        height: request.input.height,
        width: request.input.width,
        aspect_ratio: request.input.aspect_ratio,
        disable_safety_checker: request.input.disable_safety_checker,
        prompt_upsampling: request.input.prompt_upsampling,
      },
    } as PrunaPImageRequest;

    expect(client.requestHash(reordered)).toBe(client.requestHash(request));
    expect(client.requestHash(request)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('hashes the canonical resolved non-secret runtime policy', () => {
    const first = config({
      allowedDownloadHosts: [
        'SECOND.pruna.test',
        'delivery.pruna.test',
        'second.pruna.test',
      ],
    });
    const reordered = {
      ...first,
      apiKey: 'different-unit-test-key',
      allowedDownloadHosts: ['delivery.pruna.test', 'second.pruna.test'],
    };

    expect(resolvePrunaPImageClientPolicy(first)).toMatchObject({
      policySchemaVersion: 'pruna-p-image-client-policy-v1',
      model: 'p-image',
      apiBaseUrl: 'https://api.pruna.ai',
      allowedDownloadHosts: ['delivery.pruna.test', 'second.pruna.test'],
      maxJsonResponseBytes: 1024 * 1024,
      maxSourceJpegBytes: 6 * 1024 * 1024,
      statusGetRetries: 0,
      downloadGetRetries: 0,
      getRetryBaseDelayMs: 0,
      maxRetryAfterMs: 10_000,
    });
    expect(prunaPImageClientPolicySha256(first)).toBe(
      prunaPImageClientPolicySha256(reordered),
    );
    expect(prunaPImageClientPolicySha256(first)).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    ['pipeline version', { pipelineConfigVersion: 'cascade-test-v2' }],
    ['response cap', { maxJsonResponseBytes: 512 * 1024 }],
    ['source cap', { maxSourceJpegBytes: 5 * 1024 * 1024 }],
    ['submit timeout', { submitTimeoutMs: 11_000 }],
    ['status timeout', { statusRequestTimeoutMs: 6_000 }],
    ['download timeout', { downloadTimeoutMs: 11_000 }],
    ['status retries', { statusGetRetries: 1 }],
    ['download retries', { downloadGetRetries: 1 }],
    ['retry delay', { getRetryBaseDelayMs: 1 }],
  ] as const)('changes the policy digest when %s changes', (_, override) => {
    expect(prunaPImageClientPolicySha256(config(override))).not.toBe(
      prunaPImageClientPolicySha256(config()),
    );
  });

  it('never retries an ambiguous POST and never exposes the transport error', async () => {
    const transport = new FakeTransport();
    const client = new PrunaPImageClient(config(), transport);
    transport.enqueue(
      new Error(
        `${TEST_API_KEY} ${TEST_PROMPT} ${DELIVERY_URL} echoed-provider-body`,
      ),
    );

    const result = await client.submit(generationInput);

    expect(transport.requests).toHaveLength(1);
    expect(result).toMatchObject({
      certainty: 'unknown',
      reasonCode: 'PRUNA_SUBMISSION_UNCERTAIN',
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(TEST_API_KEY);
    expect(serialized).not.toContain(TEST_PROMPT);
    expect(serialized).not.toContain(DELIVERY_URL);
    expect(serialized).not.toContain('echoed-provider-body');
  });

  it('fails closed when a 201 response violates the strict schema', async () => {
    const transport = new FakeTransport();
    const client = new PrunaPImageClient(config(), transport);
    const request = client.buildRequest(generationInput);
    transport.enqueue(
      acceptedResponse(request, {
        undocumented: 'provider-body-must-not-escape',
      }),
    );

    await expect(client.submit(generationInput)).resolves.toMatchObject({
      certainty: 'unknown',
      reasonCode: 'PRUNA_SUBMISSION_UNCERTAIN',
      httpStatusClass: '2xx',
    });
    expect(transport.requests).toHaveLength(1);
  });

  it('maps an explicit 429 to a non-retried rejected submission', async () => {
    const transport = new FakeTransport();
    const client = new PrunaPImageClient(config(), transport);
    transport.enqueue(
      response(
        429,
        { prompt: TEST_PROMPT, detail: 'private provider body' },
        { 'retry-after': '2' },
      ),
    );

    await expect(client.submit(generationInput)).resolves.toEqual({
      certainty: 'not_accepted',
      reasonCode: 'PRUNA_RATE_LIMITED',
      httpStatusClass: '4xx',
      retryAfterMs: 2000,
    });
    expect(transport.requests).toHaveLength(1);
  });

  it('polls safe statuses and materializes an authenticated bounded JPEG', async () => {
    const transport = new FakeTransport();
    const client = new PrunaPImageClient(config(), transport);
    transport.enqueue(response(200, { status: 'starting' }));
    transport.enqueue(response(200, { status: 'processing' }));
    transport.enqueue(
      response(200, {
        status: 'succeeded',
        generation_url: DELIVERY_URL,
      }),
    );
    transport.enqueue(
      response(200, {
        status: 'succeeded',
        generation_url: DELIVERY_URL,
      }),
    );
    transport.enqueue(
      response(200, VALID_JPEG, {
        'content-type': 'image/jpeg; charset=binary',
        'content-length': String(VALID_JPEG.byteLength),
      }),
    );

    await expect(client.getStatus(PREDICTION_ID)).resolves.toEqual({
      status: 'starting',
    });
    await expect(client.getStatus(PREDICTION_ID)).resolves.toEqual({
      status: 'processing',
    });
    const succeeded = await client.getStatus(PREDICTION_ID);
    expect(succeeded.status).toBe('succeeded');
    if (succeeded.status !== 'succeeded') {
      throw new Error('unreachable');
    }
    expect(JSON.stringify(succeeded)).not.toContain(DELIVERY_URL);

    const jpeg = await client.downloadSucceededJpeg(PREDICTION_ID);
    expect(jpeg).toEqual({
      bytes: VALID_JPEG,
      mime: 'image/jpeg',
      byteLength: VALID_JPEG.byteLength,
      sha256: createHash('sha256').update(VALID_JPEG).digest('hex'),
    });
    expect(transport.requests).toHaveLength(5);
    const download = transport.requests[4];
    expect(download).toMatchObject({
      method: 'GET',
      url: DELIVERY_URL,
      headers: {
        Accept: 'image/jpeg',
      },
      maxResponseBytes: 6 * 1024 * 1024,
      redirect: 'manual',
    });
  });

  it('materializes more than 128 sequential successes without retained references', async () => {
    const transport = new FakeTransport();
    const client = new PrunaPImageClient(config(), transport);
    const count = 129;
    for (let index = 0; index < count; index += 1) {
      transport.enqueue(
        response(200, {
          status: 'succeeded',
          generation_url: DELIVERY_URL,
        }),
      );
      transport.enqueue(
        response(200, Buffer.from(VALID_JPEG), {
          'content-type': 'image/jpeg',
          'content-length': String(VALID_JPEG.byteLength),
        }),
      );
    }

    for (let index = 0; index < count; index += 1) {
      await expect(
        client.downloadSucceededJpeg(PREDICTION_ID),
      ).resolves.toMatchObject({
        mime: 'image/jpeg',
        byteLength: VALID_JPEG.byteLength,
      });
    }

    expect(transport.requests).toHaveLength(count * 2);
  });

  it('sends the root key only to the audited API origin', async () => {
    const transport = new FakeTransport();
    const client = new PrunaPImageClient(
      config({ allowedDownloadHosts: ['api.pruna.ai'] }),
      transport,
    );
    const sameOriginDelivery =
      'https://api.pruna.ai/v1/delivery/generated-output.jpg';
    transport.enqueue(
      response(200, {
        status: 'succeeded',
        generation_url: sameOriginDelivery,
      }),
    );
    transport.enqueue(
      response(200, Buffer.from(VALID_JPEG), {
        'content-type': 'image/jpeg',
        'content-length': String(VALID_JPEG.byteLength),
      }),
    );

    await client.downloadSucceededJpeg(PREDICTION_ID);

    expect(transport.requests[1]).toMatchObject({
      url: sameOriginDelivery,
      headers: {
        apikey: TEST_API_KEY,
        Accept: 'image/jpeg',
      },
    });
  });

  it.each(['failed', 'canceled'] as const)(
    'returns terminal %s without provider message or error text',
    async (status) => {
      const transport = new FakeTransport();
      const client = new PrunaPImageClient(config(), transport);
      transport.enqueue(
        response(200, {
          status,
          message: `${TEST_PROMPT} provider message`,
          error: `${TEST_API_KEY} provider error`,
        }),
      );

      const result = await client.getStatus(PREDICTION_ID);

      expect(result).toEqual({ status });
      expect(JSON.stringify(result)).not.toContain(TEST_PROMPT);
      expect(JSON.stringify(result)).not.toContain(TEST_API_KEY);
    },
  );

  it('rejects an unallowlisted delivery host before sending the API key to it', async () => {
    const transport = new FakeTransport();
    const client = new PrunaPImageClient(config(), transport);
    const maliciousUrl =
      'https://attacker.invalid/capture.jpg?private-capability=true';
    transport.enqueue(
      response(200, {
        status: 'succeeded',
        generation_url: maliciousUrl,
      }),
    );

    await expect(client.getStatus(PREDICTION_ID)).rejects.toMatchObject({
      message: 'PRUNA_DELIVERY_URL_REJECTED',
      metadata: {
        reasonCode: 'PRUNA_DELIVERY_URL_REJECTED',
        certainty: 'accepted',
      },
    });
    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0].url).toContain('/status/');
    expect(
      transport.requests.some((request) => request.url === maliciousUrl),
    ).toBe(false);
  });

  it('rejects delivery redirects without following or exposing Location', async () => {
    const transport = new FakeTransport();
    const client = new PrunaPImageClient(config(), transport);
    transport.enqueue(
      response(200, {
        status: 'succeeded',
        generation_url: DELIVERY_URL,
      }),
    );
    transport.enqueue(
      response(
        302,
        { secret: 'provider response' },
        { location: 'https://attacker.invalid/capture' },
      ),
    );
    await expect(
      client.downloadSucceededJpeg(PREDICTION_ID),
    ).rejects.toMatchObject({
      message: 'PRUNA_DOWNLOAD_REDIRECT_REJECTED',
      metadata: {
        reasonCode: 'PRUNA_DOWNLOAD_REDIRECT_REJECTED',
        httpStatusClass: '3xx',
      },
    });
    expect(transport.requests).toHaveLength(2);
  });

  it.each([
    [
      'wrong MIME',
      response(200, VALID_JPEG, {
        'content-type': 'image/png',
        'content-length': String(VALID_JPEG.byteLength),
      }),
      'PRUNA_OUTPUT_INVALID',
    ],
    [
      'bad JPEG magic',
      response(200, Buffer.from('not a jpeg'), {
        'content-type': 'image/jpeg',
        'content-length': String(Buffer.byteLength('not a jpeg')),
      }),
      'PRUNA_OUTPUT_INVALID',
    ],
    [
      'oversized stream',
      new PrunaTransportFailure('response_too_large'),
      'PRUNA_OUTPUT_TOO_LARGE',
    ],
  ] as const)(
    'rejects a %s with a safe code',
    async (_, outcome, reasonCode) => {
      const transport = new FakeTransport();
      const client = new PrunaPImageClient(config(), transport);
      transport.enqueue(
        response(200, {
          status: 'succeeded',
          generation_url: DELIVERY_URL,
        }),
      );
      transport.enqueue(outcome);
      await expect(
        client.downloadSucceededJpeg(PREDICTION_ID),
      ).rejects.toMatchObject({
        message: reasonCode,
        metadata: { reasonCode },
      });
    },
  );

  it('retries only idempotent status GETs within the configured bound', async () => {
    const transport = new FakeTransport();
    const sleep = jest.fn(async () => undefined);
    const client = new PrunaPImageClient(
      config({ statusGetRetries: 1 }),
      transport,
      sleep,
    );
    transport.enqueue(
      response(500, { prompt: TEST_PROMPT, body: 'must remain private' }),
    );
    transport.enqueue(response(200, { status: 'processing' }));

    await expect(client.getStatus(PREDICTION_ID)).resolves.toEqual({
      status: 'processing',
    });
    expect(transport.requests).toHaveLength(2);
    expect(
      transport.requests.every((request) => request.method === 'GET'),
    ).toBe(true);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('retries an idempotent JPEG GET without creating another prediction', async () => {
    const transport = new FakeTransport();
    const sleep = jest.fn(async () => undefined);
    const client = new PrunaPImageClient(
      config({ downloadGetRetries: 1 }),
      transport,
      sleep,
    );
    transport.enqueue(
      response(200, {
        status: 'succeeded',
        generation_url: DELIVERY_URL,
      }),
    );
    transport.enqueue(new PrunaTransportFailure('network'));
    transport.enqueue(
      response(200, VALID_JPEG, {
        'content-type': 'image/jpeg',
        'content-length': String(VALID_JPEG.byteLength),
      }),
    );
    await expect(
      client.downloadSucceededJpeg(PREDICTION_ID),
    ).resolves.toMatchObject({
      mime: 'image/jpeg',
      byteLength: VALID_JPEG.byteLength,
    });
    expect(transport.requests).toHaveLength(3);
    expect(
      transport.requests.every((request) => request.method === 'GET'),
    ).toBe(true);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('rejects undocumented status fields under the strict schema', async () => {
    const transport = new FakeTransport();
    const client = new PrunaPImageClient(config(), transport);
    transport.enqueue(
      response(200, {
        status: 'processing',
        undocumented: `${TEST_PROMPT} provider extension`,
      }),
    );

    await expect(client.getStatus(PREDICTION_ID)).rejects.toMatchObject({
      message: 'PRUNA_STATUS_INVALID',
      metadata: { reasonCode: 'PRUNA_STATUS_INVALID' },
    });
  });

  it('rejects malformed status JSON without leaking its contents', async () => {
    const transport = new FakeTransport();
    const client = new PrunaPImageClient(config(), transport);
    const forbidden = `${TEST_API_KEY} ${TEST_PROMPT} ${DELIVERY_URL}`;
    transport.enqueue(response(200, Buffer.from(`{"status":"${forbidden}"}`)));

    let caught: unknown;
    try {
      await client.getStatus(PREDICTION_ID);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PrunaPImageClientError);
    const serialized = JSON.stringify(caught);
    expect(serialized).toContain('PRUNA_STATUS_INVALID');
    expect(serialized).not.toContain(TEST_API_KEY);
    expect(serialized).not.toContain(TEST_PROMPT);
    expect(serialized).not.toContain(DELIVERY_URL);
  });

  it('rejects invalid local input before any transport call with a safe error', async () => {
    const transport = new FakeTransport();
    const client = new PrunaPImageClient(config(), transport);
    const rawPrompt = ` ${TEST_PROMPT} `;

    let caught: unknown;
    try {
      await client.submit({ ...generationInput, prompt: rawPrompt });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PrunaPImageClientError);
    expect(JSON.stringify(caught)).toEqual(
      JSON.stringify({
        stage: 'submit',
        reasonCode: 'PRUNA_REQUEST_INVALID',
        retryable: false,
        certainty: 'not_accepted',
      }),
    );
    expect(JSON.stringify(caught)).not.toContain(rawPrompt);
    expect(transport.requests).toHaveLength(0);
  });

  it('rejects unbounded runtime limits before any transport call', () => {
    const transport = new FakeTransport();

    expect(
      () =>
        new PrunaPImageClient(
          config({
            submitTimeoutMs: Number.MAX_SAFE_INTEGER,
            statusGetRetries: 1000,
          }),
          transport,
        ),
    ).toThrow(
      expect.objectContaining({
        message: 'PRUNA_REQUEST_INVALID',
        metadata: {
          stage: 'submit',
          reasonCode: 'PRUNA_REQUEST_INVALID',
          retryable: false,
          certainty: 'not_accepted',
        },
      }),
    );
    expect(transport.requests).toHaveLength(0);
  });
});
