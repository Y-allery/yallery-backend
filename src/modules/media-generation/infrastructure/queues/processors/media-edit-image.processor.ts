import { OnWorkerEvent, Processor } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationGateway } from 'src/modules/notifications/notification.gateway';
import { EditImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/edit-image-generation-request.contract';
import { MEDIA_IMAGE_EDIT_GENERATION_QUEUE } from 'src/modules/media-generation/infrastructure/queues/constants/media-generation.queue';
import { BaseMediaProcessor } from './base-media.processor';
import { MediaGenerationFinalizeService } from 'src/modules/media-generation/application/finalize/media-generation-finalize.service';
import { ImageNotificationPresenter } from 'src/modules/media-generation/infrastructure/queues/presenters/image-notification.presenter';

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
export class MediaEditImageProcessor extends BaseMediaProcessor {
  constructor(
    private readonly mediaGenerationFinalizeService: MediaGenerationFinalizeService,
    notificationGateway: NotificationGateway,
  ) {
    super(notificationGateway, 'image_edit');
  }

  async process(job: Job<MediaEditImageJobData>) {
    const { request, userId } = job.data;

    if (!userId) {
      throw new Error('userId is required for media image edit generation');
    }

    console.log(
      `[MediaEditImageProcessor] Starting edit | Job: ${job.id} | User: ${userId} | Service: ${request.aiService} | Prompt: ${request.prompt.substring(0, 50)}...`,
    );

    const result =
      await this.mediaGenerationFinalizeService.finalizeImageEditGeneration(
        request,
        userId,
      );

    return { data: result.data };
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job<MediaEditImageJobData>) {
    const { userId } = job.data;
    const data = this.getCompletedData<unknown>(
      job,
      'MediaEditImageProcessor',
    );

    if (!userId || !data) {
      return;
    }

    await this.notificationGateway.sendImageEditNotification(
      userId.toString(),
      ImageNotificationPresenter.editedImages(data),
    );
  }
}
