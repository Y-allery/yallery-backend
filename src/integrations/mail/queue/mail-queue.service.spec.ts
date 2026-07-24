import { MailQueueService } from './mail-queue.service';
import { MAIL_JOB_NAMES } from './mail.queue';

/**
 * Registration commits the account row before the mail goes out, so this
 * service exists to make the send un-fail-able from the caller's side: a dead
 * Redis must degrade to "no mail yet", never to a 500 on signup.
 */
describe('MailQueueService', () => {
  const data = {
    userId: 42,
    email: 'user@example.com',
    subject: 'Verify Your Email',
    verifyUrl: 'https://app.example.com/auth/verify-email?token=abc',
  };

  const createQueue = () =>
    jest.fn(async (...args: any[]) => ({ id: '1', args }));

  it('queues the verification mail with retries and backoff', async () => {
    const add = createQueue();
    const service = new MailQueueService({ add } as any);

    await expect(service.enqueueEmailVerification(data)).resolves.toBe(true);
    expect(add).toHaveBeenCalledWith(
      MAIL_JOB_NAMES.EMAIL_VERIFICATION,
      data,
      expect.objectContaining({
        attempts: 5,
        backoff: { type: 'exponential', delay: 15000 },
      }),
    );
  });

  it('does not dedupe by job id, so a resend is always a new send', async () => {
    const add = createQueue();
    const service = new MailQueueService({ add } as any);

    await service.enqueueEmailVerification(data);

    expect(add.mock.calls[0][2]).not.toHaveProperty('jobId');
  });

  it('reports failure instead of throwing when the queue is unreachable', async () => {
    const add = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const service = new MailQueueService({ add } as any);

    await expect(service.enqueueEmailVerification(data)).resolves.toBe(false);
  });
});
