import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MailService } from '../mail.service';
import {
  EmailVerificationJobData,
  MAIL_JOB_NAMES,
  MAIL_QUEUE,
} from './mail.queue';

@Injectable()
// One job is one email, so several can be in flight; the cap keeps a burst of
// signups from opening an unbounded number of SendGrid connections.
// A stalled job is re-run (the default) — the worst case is a duplicate
// verification mail, which is far better than a user who never gets one.
@Processor(MAIL_QUEUE, { concurrency: 5 })
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly mailService: MailService) {
    super();
  }

  async process(job: Job<EmailVerificationJobData>): Promise<void> {
    switch (job.name) {
      case MAIL_JOB_NAMES.EMAIL_VERIFICATION: {
        const { email, subject, verifyUrl } = job.data;
        await this.mailService.sendEmailVerify(email, subject, verifyUrl);
        return;
      }
      default:
        // Retrying an unknown job name would just burn attempts.
        this.logger.warn(`Ignoring unknown mail job "${job.name}"`);
    }
  }
}
