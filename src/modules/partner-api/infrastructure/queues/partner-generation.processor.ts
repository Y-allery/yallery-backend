import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PartnerGenerationService } from '../../application/partner-generation.service';
import { PartnerJobService } from '../../application/partner-job.service';
import {
  PARTNER_GENERATION_QUEUE,
  PARTNER_WEBHOOK_JOB_OPTIONS,
  PARTNER_WEBHOOK_QUEUE,
  PartnerGenerationJobData,
  PartnerWebhookJobData,
} from './partner.queues';

/**
 * Runs the generations a partner asked to be called back about.
 *
 * Not a `BaseMediaProcessor`: that one refunds points through the app's balance service and
 * pushes a websocket notification to a `userId`. A partner job has neither — it settles a
 * USD hold and its only notification is the callback.
 *
 * `concurrency` is high on purpose. There is no partner-side throttle beyond the per-key
 * rate limit: the plan is to move partner traffic to its own RunPod account rather than to
 * queue it behind the app's.
 */
@Injectable()
@Processor(PARTNER_GENERATION_QUEUE, {
  concurrency: 25,
  lockDuration: 900_000,
})
export class PartnerGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(PartnerGenerationProcessor.name);

  constructor(
    private readonly generation: PartnerGenerationService,
    private readonly jobs: PartnerJobService,
    @InjectQueue(PARTNER_WEBHOOK_QUEUE)
    private readonly webhooks: Queue<PartnerWebhookJobData>,
  ) {
    super();
  }

  async process(job: Job<PartnerGenerationJobData>): Promise<void> {
    const record = await this.jobs.findById(job.data.jobId);
    if (!record) {
      this.logger.error(`queued partner job ${job.data.jobId} has no row`);
      return;
    }
    // Redis outlives a deploy, so a job can be handed back after its row was already
    // closed. Re-running it would pay for a second generation nobody is billed for.
    if (record.status !== 'queued') return;

    try {
      await this.generation.execute(record);
    } catch {
      // The row carries the failure already; the callback is what the partner reads.
    }
    await this.notify(record.id);
  }

  /**
   * Last resort: the worker was killed, the lock expired, or BullMQ gave up.
   *
   * `execute` normally closes the row itself, so this only fires when nothing did — and it
   * has to refund, otherwise a crash silently keeps the partner's money.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<PartnerGenerationJobData>, error: Error) {
    const abandoned = await this.jobs.abandon(
      job.data.jobId,
      `worker failed: ${error?.message ?? 'unknown'}`,
    );
    if (!abandoned) return;

    await this.generation.refundAbandoned(abandoned);
    await this.notify(abandoned.id);
  }

  private async notify(jobId: number): Promise<void> {
    const record = await this.jobs.findById(jobId);
    if (!record?.callbackUrl || record.callbackStatus === 'delivered') return;

    await this.webhooks
      .add('deliver', { jobId }, PARTNER_WEBHOOK_JOB_OPTIONS)
      .catch((error) =>
        this.logger.error(
          `could not queue callback for job ${jobId}`,
          error?.stack ?? String(error),
        ),
      );
  }
}
