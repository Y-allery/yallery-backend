import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PartnerJobService } from '../../application/partner-job.service';
import { PartnerCallbackClient } from '../partner-callback.client';
import { PARTNER_WEBHOOK_QUEUE, PartnerWebhookJobData } from './partner.queues';

/**
 * Delivers a finished job to the partner's `callback_url`.
 *
 * Retries are BullMQ's, not ours: a non-2xx throws so the backoff schedule applies. The
 * delivery id stays the same across every attempt, which is what lets a partner whose
 * endpoint answered slowly discard the duplicate instead of generating twice.
 */
@Injectable()
@Processor(PARTNER_WEBHOOK_QUEUE, { concurrency: 10 })
export class PartnerWebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(PartnerWebhookProcessor.name);

  constructor(
    private readonly jobs: PartnerJobService,
    private readonly callbacks: PartnerCallbackClient,
  ) {
    super();
  }

  async process(job: Job<PartnerWebhookJobData>): Promise<void> {
    const record = await this.jobs.findById(job.data.jobId);
    if (!record?.callbackUrl) return;
    if (record.callbackStatus === 'delivered') return;

    const outcome = await this.callbacks.deliver(
      record.callbackUrl,
      record.callbackDeliveryId ?? record.publicId,
      this.jobs.view(record),
    );

    await this.jobs.recordDeliveryAttempt(record.id, {
      status: outcome.delivered ? 'delivered' : 'pending',
      httpStatus: outcome.httpStatus,
      error: outcome.error,
    });

    if (!outcome.delivered) {
      throw new Error(outcome.error ?? 'callback delivery failed');
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<PartnerWebhookJobData>) {
    const attempts = job.attemptsMade ?? 0;
    const max = job.opts?.attempts ?? 1;
    if (attempts < max) return;

    this.logger.error(
      `gave up delivering the callback for partner job ${job.data.jobId} after ${attempts} attempts`,
    );
    await this.jobs.markCallbackGaveUp(job.data.jobId);
  }
}
