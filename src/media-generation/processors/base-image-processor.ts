import { WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NotificationGateway } from 'src/notification/notification.gateway';

export abstract class BaseImageProcessor extends WorkerHost {
  constructor(protected readonly notificationGateway: NotificationGateway) {
    super();
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, err: Error) {
    const { aiService, userId } = job.data;
    const processorName = this.constructor.name;

    const attemptsMade = job.attemptsMade || 0;
    const maxAttempts = job.opts?.attempts ?? 3;

    console.error(`Job ${job.id} for ${aiService || 'unknown'} failed in ${processorName}: ${err.message} | Attempts: ${attemptsMade}/${maxAttempts}`);

    if (attemptsMade < maxAttempts) {
      console.log(`[${processorName}] Job ${job.id} will be retried (${attemptsMade + 1}/${maxAttempts})`);
      return;
    }

    if (job.finishedOn && job.processedOn) {
      const jobState = await job.getState().catch(() => null);
      if (jobState !== 'failed') {
        console.log(`[${processorName}] Job ${job.id} is not in failed state (${jobState}), skipping error notification`);
        return;
      }
    }

    if (!userId) {
      console.error(`[${processorName}] onFailed: userId is missing for job ${job.id}`);
      return;
    }

    try {
      console.error(`[${processorName}] Sending error notification for job ${job.id} after ${attemptsMade} failed attempts`);
      await this.notificationGateway.sendErrorNotification(
        userId.toString(),
        `Generation failed: ${err.message}`,
      );
    } catch (error) {
      console.error(`[${processorName}] Failed to send error notification for job ${job.id}:`, error);
    }
  }
}
