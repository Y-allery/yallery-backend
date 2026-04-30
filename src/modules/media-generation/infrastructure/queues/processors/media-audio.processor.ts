import { OnWorkerEvent, Processor } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationGateway } from 'src/modules/notifications/notification.gateway';
import { AudioGenerationRequest } from 'src/modules/media-generation/domain/contracts/audio-generation-request.contract';
import { MEDIA_AUDIO_GENERATION_QUEUE } from 'src/modules/media-generation/infrastructure/queues/constants/media-generation.queue';
import { MediaGenerationFinalizeService } from 'src/modules/media-generation/application/finalize/media-generation-finalize.service';
import { BaseMediaProcessor } from './base-media.processor';
import { AudioNotificationPresenter } from 'src/modules/media-generation/infrastructure/queues/presenters/audio-notification.presenter';

type MediaAudioJobData = {
  request: AudioGenerationRequest;
  userId: number;
  aiService: string;
};

@Injectable()
@Processor(MEDIA_AUDIO_GENERATION_QUEUE, {
  concurrency: 3,
  lockDuration: 900000,
})
export class MediaAudioProcessor extends BaseMediaProcessor {
  constructor(
    private readonly mediaGenerationFinalizeService: MediaGenerationFinalizeService,
    notificationGateway: NotificationGateway,
  ) {
    super(notificationGateway, 'audio');
  }

  async process(job: Job<MediaAudioJobData>) {
    const { request, userId } = job.data;

    if (!userId) {
      throw new Error('userId is required for media audio generation');
    }

    console.log(
      `[MediaAudioProcessor] Starting generation | Job: ${job.id} | User: ${userId} | Service: ${request.aiService} | Prompt: ${request.prompt.substring(0, 50)}...`,
    );

    return await this.mediaGenerationFinalizeService.finalizeAudioGeneration(
      request,
      userId,
    );
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job<MediaAudioJobData>) {
    const { userId } = job.data;
    const data = this.getCompletedData<any>(job, 'MediaAudioProcessor');

    if (!userId || !data) {
      return;
    }

    const [audio] = data;
    await this.notificationGateway.sendAudioNotification(
      userId.toString(),
      AudioNotificationPresenter.generated(audio),
    );
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<MediaAudioJobData>, err: Error) {
    await this.handleFailedGeneration(
      job,
      err,
      'Audio generation failed',
    );
  }
}
