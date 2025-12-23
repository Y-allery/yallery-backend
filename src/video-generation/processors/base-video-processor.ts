import { WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { ActivityEnum } from 'src/activity/types/activity.enum';

export abstract class BaseVideoProcessor extends WorkerHost {
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

  protected async handleCompletedNotification(
    job: Job,
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

      const { generatedVideo, post, suggestedTags } = result;
      
      if (!generatedVideo || !post || !post.id) {
        console.error(
          `[${processorName}] onCompleted: generatedVideo or post is missing for job ${job.id}. Return value: ${JSON.stringify(result)}`,
        );
        return;
      }

      if (!suggestedTags || !Array.isArray(suggestedTags) || suggestedTags.length === 0) {
        console.error(
          `[${processorName}] onCompleted: suggestedTags is missing or empty for job ${job.id}`,
        );
        return;
      }

      console.log(`[${processorName}] Sending success notification for job ${job.id}`);
      await this.notificationGateway.sendVideoNotification(
        userId.toString(),
        {
          uploadedVideoUrl: generatedVideo,
          id: post.id,
          videoUrl: post.videoUrl,
          previewImageUrl: post.previewImageUrl,
          generation_params: post.generation_params,
          suggestedTags,
        },
        ActivityEnum.VIDEO_GENERATE_SPEND,
      );
    } catch (error) {
      console.error(`[${processorName}] onCompleted error for job ${job.id}:`, error);
    }
  }
}

