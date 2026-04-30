import { WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  MediaGenerationErrorType,
  NotificationGateway,
} from 'src/modules/notifications/notification.gateway';

export abstract class BaseMediaProcessor extends WorkerHost {
  constructor(
    protected readonly notificationGateway: NotificationGateway,
    private readonly mediaGenerationErrorType: MediaGenerationErrorType,
  ) {
    super();
  }

  protected getCompletedData<T>(
    job: Job,
    processorName: string,
  ): T[] | null {
    const result = job.returnvalue;

    if (
      !result?.data ||
      !Array.isArray(result.data) ||
      result.data.length === 0
    ) {
      console.error(
        `[${processorName}] Missing completed payload for job ${job.id}: ${JSON.stringify(result)}`,
      );
      return null;
    }

    return result.data as T[];
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, err: Error) {
    await this.handleFailedGeneration(job, err, 'Generation failed');
  }

  protected async handleFailedGeneration(
    job: Job,
    err: Error,
    messagePrefix: string,
  ) {
    const { aiService, userId } = job.data;
    const processorName = this.constructor.name;

    const attemptsMade = job.attemptsMade || 0;
    const maxAttempts = job.opts?.attempts ?? 3;

    console.error(
      `Job ${job.id} for ${aiService || 'unknown'} failed in ${processorName}: ${err.message} | Attempts: ${attemptsMade}/${maxAttempts}`,
    );

    if (attemptsMade < maxAttempts) {
      console.log(
        `[${processorName}] Job ${job.id} will be retried (${attemptsMade + 1}/${maxAttempts})`,
      );
      return;
    }

    if (job.finishedOn && job.processedOn) {
      const jobState = await job.getState().catch(() => null);
      if (jobState !== 'failed') {
        console.log(
          `[${processorName}] Job ${job.id} is not in failed state (${jobState}), skipping error notification`,
        );
        return;
      }
    }

    if (!userId) {
      console.error(
        `[${processorName}] onFailed: userId is missing for job ${job.id}`,
      );
      return;
    }

    try {
      const message = `${messagePrefix}: ${err.message}`;
      console.error(
        `[${processorName}] Sending media generation error for job ${job.id} after ${attemptsMade} failed attempts`,
      );
      await this.notificationGateway.sendMediaGenerationError(
        userId.toString(),
        {
          type: this.mediaGenerationErrorType,
          message,
          jobId: job.id?.toString(),
          aiService,
        },
      );
    } catch (error) {
      console.error(
        `[${processorName}] Failed to send media generation error for job ${job.id}:`,
        error,
      );
    }
  }
}
