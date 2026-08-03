import { FirebaseService } from './firebase.service';

/**
 * Every FCM error used to collapse into `{ success: false }`, so the two
 * failures that arrive in bursts under load — 429 QUOTA_EXCEEDED and 503
 * UNAVAILABLE — dropped the message without a trace. Retryable and terminal
 * failures must now be distinguishable, and the invalid-token classification
 * (callers delete those tokens) must keep working exactly as before.
 */
describe('FirebaseService.sendNotification', () => {
  const makeService = (
    send: jest.Mock,
    config: Record<string, string> = {},
  ) => {
    const configService = { get: (key: string) => config[key] };
    const service = new FirebaseService(configService as any);
    (service as any).firebaseApp = { messaging: () => ({ send }) };
    // Real backoff would make the suite sleep for seconds.
    const sleep = jest
      .spyOn(service as any, 'sleep')
      .mockResolvedValue(undefined);
    jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);
    jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => undefined);
    return { service, sleep };
  };

  const fcmError = (props: Record<string, any>) =>
    Object.assign(new Error(props.message ?? 'failed'), props);

  it('returns the message id on the first success', async () => {
    const send = jest.fn(async () => 'projects/x/messages/1');
    const { service, sleep } = makeService(send);

    const result = await service.sendNotification('token-abcdefghij', 't', 'b');

    expect(result).toMatchObject({
      success: true,
      response: 'projects/x/messages/1',
      attempts: 1,
    });
    expect(sleep).not.toHaveBeenCalled();
  });

  // The client reads `data` to decide which screen a tap opens; FCM rejects a message
  // whose data values are not strings, so the field is passed through untouched.
  it('forwards a data payload and omits the key entirely when there is none', async () => {
    const send = jest.fn(async () => 'projects/x/messages/1');
    const { service } = makeService(send);

    await service.sendNotification('token-abcdefghij', 't', 'b', {
      type: 'contest_opened',
      contestId: '42',
    });
    expect(send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: { type: 'contest_opened', contestId: '42' },
      }),
    );

    await service.sendNotification('token-abcdefghij', 't', 'b');
    expect(send).toHaveBeenNthCalledWith(
      2,
      expect.not.objectContaining({ data: expect.anything() }),
    );
  });

  it('never retries an unregistered token and still flags it for deletion', async () => {
    const send = jest.fn(async () => {
      throw fcmError({
        code: 'messaging/registration-token-not-registered',
        message: 'Requested entity was not found.',
      });
    });
    const { service } = makeService(send);

    const result = await service.sendNotification('token-abcdefghij', 't', 'b');

    expect(result).toMatchObject({
      success: false,
      isInvalidToken: true,
      isRetryable: false,
      attempts: 1,
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('retries a 503 UNAVAILABLE with backoff and succeeds', async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(
        fcmError({
          code: 'messaging/server-unavailable',
          message: 'UNAVAILABLE',
        }),
      )
      .mockResolvedValueOnce('projects/x/messages/2');
    const { service, sleep } = makeService(send);

    const result = await service.sendNotification('token-abcdefghij', 't', 'b');

    expect(result).toMatchObject({ success: true, attempts: 2 });
    expect(sleep).toHaveBeenCalledTimes(1);
    // Jittered, but never zero and never above the cap.
    const delay = sleep.mock.calls[0][0] as number;
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(8000);
  });

  it('gives up after the attempt budget and reports the failure as retryable', async () => {
    const send = jest.fn(async () => {
      throw fcmError({ code: 'messaging/internal-error', message: 'INTERNAL' });
    });
    const { service } = makeService(send, { FCM_MAX_ATTEMPTS: '2' });

    const result = await service.sendNotification('token-abcdefghij', 't', 'b');

    expect(send).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      success: false,
      isRetryable: true,
      isInvalidToken: false,
      attempts: 2,
    });
  });

  it('defers instead of sleeping when quota back-off is a minute', async () => {
    const send = jest.fn(async () => {
      throw fcmError({
        code: 'messaging/quota-exceeded',
        message: 'QUOTA_EXCEEDED',
      });
    });
    const { service, sleep } = makeService(send);

    const result = await service.sendNotification('token-abcdefghij', 't', 'b');

    // One attempt only: pinning a worker for 60s is worse than handing the
    // wait back to the caller's own backoff.
    expect(send).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      isRetryable: true,
      retryAfterMs: 60000,
    });
  });

  it('honors a short Retry-After header instead of its own backoff', async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(
        fcmError({
          code: 'messaging/quota-exceeded',
          message: 'QUOTA_EXCEEDED',
          response: { status: 429, headers: { 'retry-after': '2' } },
        }),
      )
      .mockResolvedValueOnce('projects/x/messages/3');
    const { service, sleep } = makeService(send);

    const result = await service.sendNotification('token-abcdefghij', 't', 'b');

    expect(sleep).toHaveBeenCalledWith(2000);
    expect(result).toMatchObject({ success: true, attempts: 2 });
  });

  it('treats an HTTP-date Retry-After as a delay', async () => {
    const retryAt = new Date(Date.now() + 3000).toUTCString();
    const send = jest
      .fn()
      .mockRejectedValueOnce(
        fcmError({
          message: 'RESOURCE_EXHAUSTED',
          response: { headers: { 'retry-after': retryAt } },
        }),
      )
      .mockResolvedValueOnce('projects/x/messages/4');
    const { service, sleep } = makeService(send);

    await service.sendNotification('token-abcdefghij', 't', 'b');

    const delay = sleep.mock.calls[0][0] as number;
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(3000);
  });

  it('fails a hung send on the request timeout and retries it', async () => {
    const send = jest
      .fn()
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValueOnce('projects/x/messages/5');
    const { service } = makeService(send, { FCM_TIMEOUT_MS: '20' });

    const result = await service.sendNotification('token-abcdefghij', 't', 'b');

    expect(result).toMatchObject({ success: true, attempts: 2 });
  });

  it('does not retry a permanent argument error', async () => {
    const send = jest.fn(async () => {
      throw fcmError({
        code: 'messaging/invalid-argument',
        message: 'Invalid JSON payload',
      });
    });
    const { service } = makeService(send);

    const result = await service.sendNotification('token-abcdefghij', 't', 'b');

    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: false,
      isRetryable: false,
      isInvalidToken: false,
    });
  });
});
