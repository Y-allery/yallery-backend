import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  EmailVerificationJobData,
  MAIL_JOB_NAMES,
  MAIL_QUEUE,
} from './mail.queue';

@Injectable()
export class MailQueueService {
  private readonly logger = new Logger(MailQueueService.name);

  constructor(
    @InjectQueue(MAIL_QUEUE)
    private readonly mailQueue: Queue<EmailVerificationJobData>,
  ) {}

  /**
   * Never throws. Registration commits the user row before the mail goes out,
   * so a SendGrid outage — or Redis being unreachable — must not turn a
   * created account into a 500 the client reads as "signup failed".
   *
   * Returns whether the job was accepted so callers can log the gap; the user
   * can always recover through POST /auth/resend-verification.
   */
  async enqueueEmailVerification(
    data: EmailVerificationJobData,
  ): Promise<boolean> {
    try {
      // No fixed jobId: a resend must always produce a new send, and the
      // retries below are what carry us through a throttled provider.
      await this.mailQueue.add(MAIL_JOB_NAMES.EMAIL_VERIFICATION, data, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 15000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to enqueue verification email for user ${data.userId}`,
        error?.stack ?? error?.message ?? String(error),
      );
      return false;
    }
  }
}
