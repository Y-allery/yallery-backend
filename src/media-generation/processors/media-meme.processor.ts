import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { MEDIA_MEME_GENERATION_QUEUE } from '../constants/media-generation.queue';
import { MemeGenerationRequest } from '../contracts/meme-generation-request.contract';
import { MediaGenerationService } from '../media-generation.service';

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
export class MediaMemeProcessor extends WorkerHost {
  constructor(
    private readonly mediaGenerationService: MediaGenerationService,
    private readonly notificationGateway: NotificationGateway,
  ) {
    super();
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
      jobId: String(job.id),
      status: 'started',
      message: 'Meme generation started',
    });

    const result = await this.mediaGenerationService.finalizeMemeGeneration(
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
    await this.notificationGateway.sendMemeGenerated(userId.toString(), {
      id: meme.id,
      videoUrl: meme.videoUrl,
      previewImageUrl: meme.previewImageUrl,
      generationParams: meme.generationParams,
      publishTo: meme.publishTo,
    });

    return result;
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<MediaMemeJobData>, err: Error) {
    const { userId } = job.data;
    const attemptsMade = job.attemptsMade || 0;
    const maxAttempts = job.opts?.attempts ?? 3;

    console.error(
      `Job ${job.id} failed in MediaMemeProcessor: ${err.message} | Attempts: ${attemptsMade}/${maxAttempts}`,
    );

    if (attemptsMade < maxAttempts || !userId) {
      return;
    }

    await this.notificationGateway.sendMemeGenerationFailed(userId.toString(), {
      jobId: String(job.id),
      error: err.message,
    });
  }
}
