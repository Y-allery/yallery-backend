import {
  FetchPrunaHttpTransport,
  PrunaTransportFailure,
} from './pruna-p-image.transport';

describe('FetchPrunaHttpTransport', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses manual redirects and reads a mocked response without network I/O', async () => {
    const body = Buffer.from('bounded response');
    const getReader = jest.fn().mockReturnValueOnce({
      read: jest
        .fn()
        .mockResolvedValueOnce({ done: false, value: body })
        .mockResolvedValueOnce({ done: true }),
    });
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({
        'content-type': 'application/json',
        'content-length': String(body.byteLength),
      }),
      body: { getReader },
    }) as typeof fetch;

    const transport = new FetchPrunaHttpTransport();
    const response = await transport.request({
      method: 'GET',
      url: 'https://api.pruna.ai/v1/predictions/status/mock-id',
      headers: { apikey: 'mock-key' },
      timeoutMs: 1000,
      maxResponseBytes: body.byteLength,
      redirect: 'manual',
    });

    expect(response.body).toEqual(body);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.pruna.ai/v1/predictions/status/mock-id',
      expect.objectContaining({
        method: 'GET',
        redirect: 'manual',
        headers: { apikey: 'mock-key' },
      }),
    );
  });

  it('rejects a declared response larger than the cap without reading it', async () => {
    const getReader = jest.fn();
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-length': '101' }),
      body: { getReader },
    }) as typeof fetch;

    const transport = new FetchPrunaHttpTransport();

    await expect(
      transport.request({
        method: 'GET',
        url: 'https://api.pruna.ai/v1/predictions/status/mock-id',
        headers: {},
        timeoutMs: 1000,
        maxResponseBytes: 100,
        redirect: 'manual',
      }),
    ).rejects.toEqual(new PrunaTransportFailure('response_too_large'));
    expect(getReader).not.toHaveBeenCalled();
  });

  it('turns arbitrary fetch errors into a cause-free safe transport failure', async () => {
    const forbidden =
      'mock-key raw-prompt https://delivery.pruna.test/private.jpg';
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error(forbidden)) as typeof fetch;

    const transport = new FetchPrunaHttpTransport();
    let caught: unknown;
    try {
      await transport.request({
        method: 'POST',
        url: 'https://api.pruna.ai/v1/predictions',
        headers: { apikey: 'mock-key' },
        body: '{"input":{"prompt":"raw-prompt"}}',
        timeoutMs: 1000,
        maxResponseBytes: 1024,
        redirect: 'manual',
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toEqual(new PrunaTransportFailure('network'));
    expect(String((caught as Error).message)).not.toContain(forbidden);
    expect(JSON.stringify(caught)).not.toContain('mock-key');
    expect(JSON.stringify(caught)).not.toContain('raw-prompt');
    expect(JSON.stringify(caught)).not.toContain('delivery.pruna.test');
  });
});
