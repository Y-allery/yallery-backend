import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { MEDIA_IMAGE_VIDEO_GENERATION_QUEUE } from '../constants/media-generation.queue';
import { ImageVideoGenerationRequest } from '../contracts/image-video-generation-request.contract';
import { MediaGenerationService } from '../media-generation.service';

type MediaImageVideoJobData = {
  request: ImageVideoGenerationRequest;
  userId: number;
  aiService: string;
};

@Injectable()
@Processor(MEDIA_IMAGE_VIDEO_GENERATION_QUEUE, {
  concurrency: 3,
  lockDuration: 900000,
})
export class MediaImageVideoProcessor extends WorkerHost {
  constructor(
    private readonly mediaGenerationService: MediaGenerationService,
    private readonly notificationGateway: NotificationGateway,
  ) {
    super();
  }

  async process(job: Job<MediaImageVideoJobData>) {
    const { request, userId } = job.data;

    if (!userId) {
      throw new Error('userId is required for media image video generation');
    }

    console.log(
      `[MediaImageVideoProcessor] Starting generation | Job: ${job.id} | User: ${userId} | Service: ${request.aiService} | Prompt: ${request.prompt.substring(0, 50)}...`,
    );

    return await this.mediaGenerationService.finalizeImageVideoGeneration(
      request,
      userId,
    );
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job<MediaImageVideoJobData>) {
    const { userId } = job.data;
    const result = job.returnvalue;

    if (!userId || !result?.data || !Array.isArray(result.data) || result.data.length === 0) {
      console.error(
        `[MediaImageVideoProcessor] Missing completed payload for job ${job.id}: ${JSON.stringify(result)}`,
      );
      return;
    }

    const [video] = result.data;
    await this.notificationGateway.sendVideoNotification(
      userId.toString(),
      {
        uploadedVideoUrl: video.videoUrl,
        id: video.id,
        videoUrl: video.videoUrl,
        previewImageUrl: video.previewImageUrl,
        generationParams: video.generationParams,
        suggestedTags: [],
        publishTo: video.publishTo,
      },
    );
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<MediaImageVideoJobData>, err: Error) {
    const { aiService, userId } = job.data;
    const attemptsMade = job.attemptsMade || 0;
    const maxAttempts = job.opts?.attempts ?? 3;

    console.error(
      `Job ${job.id} for ${aiService || 'unknown'} failed in MediaImageVideoProcessor: ${err.message} | Attempts: ${attemptsMade}/${maxAttempts}`,
    );

    if (attemptsMade < maxAttempts || !userId) {
      return;
    }

    await this.notificationGateway.sendErrorNotification(
      userId.toString(),
      `Generation failed: ${err.message}`,
    );
  }
}
