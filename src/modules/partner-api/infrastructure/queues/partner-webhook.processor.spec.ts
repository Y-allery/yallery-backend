import { Job } from 'bullmq';
import { PartnerWebhookProcessor } from './partner-webhook.processor';

describe('PartnerWebhookProcessor', () => {
  let jobs: {
    findById: jest.Mock;
    view: jest.Mock;
    recordDeliveryAttempt: jest.Mock;
    markCallbackGaveUp: jest.Mock;
  };
  let callbacks: { deliver: jest.Mock };
  let processor: PartnerWebhookProcessor;

  const record = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    publicId: 'job_abc',
    callbackUrl: 'https://partner.example/hook',
    callbackStatus: 'pending',
    callbackDeliveryId: 'delivery-1',
    ...overrides,
  });

  const queued = (overrides: Record<string, unknown> = {}) =>
    ({
      data: { jobId: 1 },
      attemptsMade: 1,
      opts: { attempts: 6 },
      ...overrides,
    }) as unknown as Job<{
      jobId: number;
    }>;

  beforeEach(() => {
    jobs = {
      findById: jest.fn().mockResolvedValue(record()),
      view: jest.fn().mockReturnValue({ id: 'job_abc', status: 'succeeded' }),
      recordDeliveryAttempt: jest.fn().mockResolvedValue(undefined),
      markCallbackGaveUp: jest.fn().mockResolvedValue(undefined),
    };
    callbacks = {
      deliver: jest
        .fn()
        .mockResolvedValue({ delivered: true, httpStatus: 200, error: null }),
    };
    processor = new PartnerWebhookProcessor(jobs as never, callbacks as never);
  });

  it('delivers and records the attempt', async () => {
    await processor.process(queued());

    expect(callbacks.deliver).toHaveBeenCalledWith(
      'https://partner.example/hook',
      'delivery-1',
      expect.objectContaining({ id: 'job_abc' }),
    );
    expect(jobs.recordDeliveryAttempt).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: 'delivered' }),
    );
  });

  // BullMQ's backoff is the retry policy; the throw is what arms it.
  it('throws on a failed delivery so the queue retries it', async () => {
    callbacks.deliver.mockResolvedValue({
      delivered: false,
      httpStatus: 502,
      error: 'callback returned 502',
    });

    await expect(processor.process(queued())).rejects.toThrow('502');
    expect(jobs.recordDeliveryAttempt).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: 'pending', httpStatus: 502 }),
    );
  });

  // A partner endpoint that answered slowly gets the retry anyway; sending twice more
  // after it finally 200s would look like we generate on every retry.
  it('does not deliver a job that already arrived', async () => {
    jobs.findById.mockResolvedValue(record({ callbackStatus: 'delivered' }));

    await processor.process(queued());

    expect(callbacks.deliver).not.toHaveBeenCalled();
  });

  it('ignores a job with no callback', async () => {
    jobs.findById.mockResolvedValue(record({ callbackUrl: null }));

    await processor.process(queued());

    expect(callbacks.deliver).not.toHaveBeenCalled();
  });

  describe('when the queue gives up', () => {
    it('closes delivery only after the last attempt', async () => {
      await processor.onFailed(queued({ attemptsMade: 3 }));
      expect(jobs.markCallbackGaveUp).not.toHaveBeenCalled();

      await processor.onFailed(queued({ attemptsMade: 6 }));
      expect(jobs.markCallbackGaveUp).toHaveBeenCalledWith(1);
    });
  });
});
