import { OnWorkerEvent, Processor } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationGateway } from 'src/modules/notifications/notification.gateway';
import { MEDIA_MEME_GENERATION_QUEUE } from 'src/modules/media-generation/infrastructure/queues/constants/media-generation.queue';
import { MemeGenerationRequest } from 'src/modules/media-generation/domain/contracts/meme-generation-request.contract';
import { MediaGenerationFinalizeService } from 'src/modules/media-generation/application/finalize/media-generation-finalize.service';
import { BaseMediaProcessor } from './base-media.processor';
import { MemeNotificationPresenter } from 'src/modules/media-generation/infrastructure/queues/presenters/meme-notification.presenter';

type MediaMemeJobData = {
  request: MemeGenerationRequest;
  userId: number;
  aiService: string;
};

@Injectable()
@Processor(MEDIA_MEME_GENERATION_QUEUE, {
  concurrency: 3,
  lockDuration: 900000,
})
export class MediaMemeProcessor extends BaseMediaProcessor {
  constructor(
    private readonly mediaGenerationFinalizeService: MediaGenerationFinalizeService,
    notificationGateway: NotificationGateway,
  ) {
    super(notificationGateway, 'meme');
  }

  async process(job: Job<MediaMemeJobData>) {
    const { request, userId } = job.data;

    if (!userId) {
      throw new Error('userId is required for media meme generation');
    }

    console.log(
      `[MediaMemeProcessor] Starting generation | Job: ${job.id} | User: ${userId} | Service: ${request.aiService} | Meme: ${request.memeId}`,
    );

    await this.notificationGateway.sendMemeGenerationProgress(userId.toString(), {
      ...MemeNotificationPresenter.started(String(job.id)),
    });

    const result = await this.mediaGenerationFinalizeService.finalizeMemeGeneration(
      request,
      userId,
    );

    if (!result?.data || !Array.isArray(result.data) || result.data.length === 0) {
      console.error(
        `[MediaMemeProcessor] Missing completed payload for job ${job.id}: ${JSON.stringify(result)}`,
      );
      return result;
    }

    const [meme] = result.data;
    await this.notificationGateway.sendMemeGenerated(
      userId.toString(),
      MemeNotificationPresenter.generated(meme),
    );

    return result;
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<MediaMemeJobData>, err: Error) {
    await this.handleFailedGeneration(job, err, 'Generation failed');
  }
}
