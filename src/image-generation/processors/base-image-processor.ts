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
    
    console.error(`Job ${job.id} for ${aiService || 'unknown'} failed in ${processorName}: ${err.message}`);

    const attemptsMade = job.attemptsMade;
    const maxAttempts = job.opts.attempts ?? 1;

    if (attemptsMade < maxAttempts) {
      return;
    }

    if (!userId) {
      console.error(`[${processorName}] onFailed: userId is missing for job ${job.id}`);
      return;
    }

    try {
      await this.notificationGateway.sendErrorNotification(
        userId.toString(),
        ` ${err.message}`,
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

