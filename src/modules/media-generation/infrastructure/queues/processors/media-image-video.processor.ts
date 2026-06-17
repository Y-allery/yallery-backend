import { OnWorkerEvent, Processor } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationGateway } from 'src/modules/notifications/notification.gateway';
import { MEDIA_IMAGE_VIDEO_GENERATION_QUEUE } from 'src/modules/media-generation/infrastructure/queues/constants/media-generation.queue';
import { ImageVideoGenerationRequest } from 'src/modules/media-generation/domain/contracts/image-video-generation-request.contract';
import { MediaGenerationFinalizeService } from 'src/modules/media-generation/application/finalize/media-generation-finalize.service';
import { MediaGenerationBalanceService } from 'src/modules/media-generation/application/balance/media-generation-balance.service';
import { BaseMediaProcessor } from './base-media.processor';
import { VideoNotificationPresenter } from 'src/modules/media-generation/infrastructure/queues/presenters/video-notification.presenter';

type MediaImageVideoJobData = {
  request: ImageVideoGenerationRequest;
  userId: number;
  aiService: string;
  chargeId?: string;
};

@Injectable()
@Processor(MEDIA_IMAGE_VIDEO_GENERATION_QUEUE, {
  concurrency: 3,
  lockDuration: 900000,
})
export class MediaImageVideoProcessor extends BaseMediaProcessor {
  constructor(
    private readonly mediaGenerationFinalizeService: MediaGenerationFinalizeService,
    notificationGateway: NotificationGateway,
    mediaGenerationBalanceService: MediaGenerationBalanceService,
  ) {
    super(notificationGateway, 'video', mediaGenerationBalanceService);
  }

  async process(job: Job<MediaImageVideoJobData>) {
    const { request, userId } = job.data;

    if (!userId) {
      throw new Error('userId is required for media image video generation');
    }

    console.log(
      `[MediaImageVideoProcessor] Starting generation | Job: ${job.id} | User: ${userId} | Service: ${request.aiService} | Prompt: ${request.prompt.substring(0, 50)}...`,
    );

    const result =
      await this.mediaGenerationFinalizeService.finalizeImageVideoGeneration(
        request,
        userId,
      );

    return { data: result.data };
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job<MediaImageVideoJobData>) {
    const { userId } = job.data;
    const data = this.getCompletedData<any>(job, 'MediaImageVideoProcessor');

    if (!userId || !data) {
      return;
    }

    const [video] = data;
    await this.notificationGateway.sendVideoNotification(
      userId.toString(),
      VideoNotificationPresenter.generated(video),
    );
  }
}
