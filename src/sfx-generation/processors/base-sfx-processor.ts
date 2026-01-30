import { WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { ActivityEnum } from 'src/activity/types/activity.enum';

export abstract class BaseSfxProcessor extends WorkerHost {
  constructor(protected readonly notificationGateway: NotificationGateway) {
    super();
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, err: Error) {
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

    if (!userId) {
      console.error(`[${processorName}] onFailed: userId is missing for job ${job.id}`);
      return;
    }

    try {
      await this.notificationGateway.sendErrorNotification(
        userId.toString(),
        `Generation failed: ${err.message}`,
      );
    } catch (error) {
      console.error(
        `[${processorName}] Failed to send error notification for job ${job.id}:`,
        error,
      );
    }
  }

  protected async handleCompletedNotification(job: Job): Promise<void> {
    const processorName = this.constructor.name;
    try {
      const { userId } = job.data;
      if (!userId) return;

      const result = job.returnvalue;
      if (!result) return;

      const { generatedVideo, post, suggestedTags } = result;
      if (!generatedVideo || !post || !post.id) return;

      await this.notificationGateway.sendVideoNotification(
        userId.toString(),
        {
          uploadedVideoUrl: generatedVideo,
          id: post.id,
          videoUrl: post.videoUrl,
          previewImageUrl: post.previewImageUrl,
          generationParams: post.generationParams,
          suggestedTags,
        },
        ActivityEnum.VIDEO_GENERATE_SPEND,
      );
    } catch (error) {
      console.error(`[${processorName}] onCompleted error for job ${job.id}:`, error);
    }
  }
}

