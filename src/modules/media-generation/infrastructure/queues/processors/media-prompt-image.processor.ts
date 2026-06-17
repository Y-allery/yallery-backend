import { OnWorkerEvent, Processor } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationGateway } from 'src/modules/notifications/notification.gateway';
import { ResolvedPromptImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/prompt-image-generation-request.contract';
import { MEDIA_PROMPT_IMAGE_GENERATION_QUEUE } from 'src/modules/media-generation/infrastructure/queues/constants/media-generation.queue';
import { BaseMediaProcessor } from './base-media.processor';
import { MediaGenerationFinalizeService } from 'src/modules/media-generation/application/finalize/media-generation-finalize.service';
import { MediaGenerationBalanceService } from 'src/modules/media-generation/application/balance/media-generation-balance.service';
import { ImageNotificationPresenter } from 'src/modules/media-generation/infrastructure/queues/presenters/image-notification.presenter';

type MediaPromptImageJobData = {
  request: ResolvedPromptImageGenerationRequest;
  userId: number;
  aiService: string;
  chargeId?: string;
};

@Injectable()
@Processor(MEDIA_PROMPT_IMAGE_GENERATION_QUEUE, {
  concurrency: 5,
  lockDuration: 900000,
})
export class MediaPromptImageProcessor extends BaseMediaProcessor {
  constructor(
    private readonly mediaGenerationFinalizeService: MediaGenerationFinalizeService,
    notificationGateway: NotificationGateway,
    mediaGenerationBalanceService: MediaGenerationBalanceService,
  ) {
    super(notificationGateway, 'image', mediaGenerationBalanceService);
  }

  async process(job: Job<MediaPromptImageJobData>) {
    const { request, userId } = job.data;

    if (!userId) {
      throw new Error('userId is required for media prompt image generation');
    }

    console.log(
      `[MediaPromptImageProcessor] Starting generation | Job: ${job.id} | User: ${userId} | Service: ${request.aiService} | Prompt: ${request.prompt.substring(0, 50)}...`,
    );

    const result =
      await this.mediaGenerationFinalizeService.finalizePromptImageGeneration(
        request,
        userId,
      );

    return { data: result.data };
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job<MediaPromptImageJobData>) {
    const { userId } = job.data;
    const data = this.getCompletedData<unknown>(
      job,
      'MediaPromptImageProcessor',
    );

    if (!userId || !data) {
      return;
    }

    await this.notificationGateway.sendImageArrayNotification(
      userId.toString(),
      ImageNotificationPresenter.promptImages(data),
    );
  }
}
