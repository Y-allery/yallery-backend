import { WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { ActivityEnum } from 'src/activity/types/activity.enum';

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

    // Не відправляємо помилку, якщо є ще спроби для retry
    if (attemptsMade < maxAttempts) {
      console.log(`[${processorName}] Job ${job.id} will be retried (${attemptsMade + 1}/${maxAttempts})`);
      return;
    }

    // Перевіряємо, чи джоба дійсно failed (не в процесі retry)
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

  protected async handleCompletedNotification(
    job: Job,
    isEdit: boolean = false,
  ): Promise<void> {
    const processorName = this.constructor.name;
    
    try {
      // Перевіряємо, чи джоба дійсно completed, а не failed
      const jobState = await job.getState().catch(() => 'completed');
      if (jobState !== 'completed') {
        console.log(`[${processorName}] Job ${job.id} is not in completed state (${jobState}), skipping success notification`);
        return;
      }

      const { userId } = job.data;
      if (!userId) {
        console.error(`[${processorName}] onCompleted: userId is missing for job ${job.id}`);
        return;
      }

      const result = job.returnvalue;
      if (!result) {
        console.error(`[${processorName}] onCompleted: return value is missing for job ${job.id}`);
        return;
      }

      const generatedImages = result?.data || result;
      if (!generatedImages || !Array.isArray(generatedImages) || generatedImages.length === 0) {
        console.error(
          `[${processorName}] onCompleted: generatedImages is missing or empty for job ${job.id}. Return value: ${JSON.stringify(result)}`,
        );
        return;
      }

      console.log(`[${processorName}] Sending success notification for job ${job.id} with ${generatedImages.length} images`);
      await this.notificationGateway.sendImageArrayNotification(
        userId.toString(),
        generatedImages,
        ActivityEnum.IMAGE_GENERATE_SPEND,
        isEdit,
      );
    } catch (error) {
      console.error(`[${processorName}] onCompleted error for job ${job.id}:`, error);
    }
  }
}

