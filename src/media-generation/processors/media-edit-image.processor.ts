import { OnWorkerEvent, Processor } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { BaseImageProcessor } from 'src/image-generation/processors/base-image-processor';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { EditImageGenerationRequest } from '../contracts/edit-image-generation-request.contract';
import { MEDIA_IMAGE_EDIT_GENERATION_QUEUE } from '../constants/media-generation.queue';
import { MediaGenerationService } from '../media-generation.service';

type MediaEditImageJobData = {
  request: EditImageGenerationRequest;
  userId: number;
  aiService: string;
};

@Injectable()
@Processor(MEDIA_IMAGE_EDIT_GENERATION_QUEUE, {
  concurrency: 5,
  lockDuration: 900000,
})
export class MediaEditImageProcessor extends BaseImageProcessor {
  constructor(
    private readonly mediaGenerationService: MediaGenerationService,
    notificationGateway: NotificationGateway,
  ) {
    super(notificationGateway);
  }

  async process(job: Job<MediaEditImageJobData>) {
    const { request, userId } = job.data;

    if (!userId) {
      throw new Error('userId is required for media image edit generation');
    }

    console.log(
      `[MediaEditImageProcessor] Starting edit | Job: ${job.id} | User: ${userId} | Service: ${request.aiService} | Prompt: ${request.prompt.substring(0, 50)}...`,
    );

    return await this.mediaGenerationService.finalizeImageEditGeneration(
      request,
      userId,
    );
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job<MediaEditImageJobData>) {
    const { userId } = job.data;
    const result = job.returnvalue;

    if (!userId || !result?.data || !Array.isArray(result.data) || result.data.length === 0) {
      console.error(
        `[MediaEditImageProcessor] Missing completed payload for job ${job.id}: ${JSON.stringify(result)}`,
      );
      return;
    }

    await this.notificationGateway.sendImageEditNotification(
      userId.toString(),
      { data: result.data },
    );
  }
}
