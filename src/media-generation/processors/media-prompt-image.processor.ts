import { OnWorkerEvent, Processor } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { ResolvedPromptImageGenerationRequest } from '../contracts/prompt-image-generation-request.contract';
import { MEDIA_PROMPT_IMAGE_GENERATION_QUEUE } from '../constants/media-generation.queue';
import { MediaGenerationService } from '../media-generation.service';
import { BaseImageProcessor } from './base-image-processor';

type MediaPromptImageJobData = {
  request: ResolvedPromptImageGenerationRequest;
  userId: number;
  aiService: string;
};

@Injectable()
@Processor(MEDIA_PROMPT_IMAGE_GENERATION_QUEUE, {
  concurrency: 5,
  lockDuration: 900000,
})
export class MediaPromptImageProcessor extends BaseImageProcessor {
  constructor(
    private readonly mediaGenerationService: MediaGenerationService,
    notificationGateway: NotificationGateway,
  ) {
    super(notificationGateway);
  }

  async process(job: Job<MediaPromptImageJobData>) {
    const { request, userId } = job.data;

    if (!userId) {
      throw new Error('userId is required for media prompt image generation');
    }

    console.log(
      `[MediaPromptImageProcessor] Starting generation | Job: ${job.id} | User: ${userId} | Service: ${request.aiService} | Prompt: ${request.prompt.substring(0, 50)}...`,
    );

    return await this.mediaGenerationService.finalizePromptImageGeneration(
      request,
      userId,
    );
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job<MediaPromptImageJobData>) {
    const { userId } = job.data;
    const result = job.returnvalue;

    if (!userId || !result?.data || !Array.isArray(result.data) || result.data.length === 0) {
      console.error(
        `[MediaPromptImageProcessor] Missing completed payload for job ${job.id}: ${JSON.stringify(result)}`,
      );
      return;
    }

    await this.notificationGateway.sendImageArrayNotification(
      userId.toString(),
      { data: result.data },
    );
  }
}
