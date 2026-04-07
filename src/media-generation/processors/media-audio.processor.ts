import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { AudioGenerationRequest } from '../contracts/audio-generation-request.contract';
import { MEDIA_AUDIO_GENERATION_QUEUE } from '../constants/media-generation.queue';
import { MediaGenerationService } from '../media-generation.service';

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
export class MediaAudioProcessor extends WorkerHost {
  constructor(
    private readonly mediaGenerationService: MediaGenerationService,
    private readonly notificationGateway: NotificationGateway,
  ) {
    super();
  }

  async process(job: Job<MediaAudioJobData>) {
    const { request, userId } = job.data;

    if (!userId) {
      throw new Error('userId is required for media audio generation');
    }

    console.log(
      `[MediaAudioProcessor] Starting generation | Job: ${job.id} | User: ${userId} | Service: ${request.aiService} | Prompt: ${request.prompt.substring(0, 50)}...`,
    );

    return await this.mediaGenerationService.finalizeAudioGeneration(
      request,
      userId,
    );
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job<MediaAudioJobData>) {
    const { userId } = job.data;
    const result = job.returnvalue;

    if (!userId || !result?.data || !Array.isArray(result.data) || result.data.length === 0) {
      console.error(
        `[MediaAudioProcessor] Missing completed payload for job ${job.id}: ${JSON.stringify(result)}`,
      );
      return;
    }

    const [audio] = result.data;
    await this.notificationGateway.sendAudioNotification(
      userId.toString(),
      {
        uploadedVideoUrl: audio.videoUrl,
        id: audio.id,
        videoUrl: audio.videoUrl,
        previewImageUrl: audio.previewImageUrl,
        generationParams: audio.generationParams,
        suggestedTags: [],
        publishTo: audio.publishTo,
      },
    );
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<MediaAudioJobData>, err: Error) {
    const { aiService, userId } = job.data;
    const attemptsMade = job.attemptsMade || 0;
    const maxAttempts = job.opts?.attempts ?? 3;

    console.error(
      `Job ${job.id} for ${aiService || 'unknown'} failed in MediaAudioProcessor: ${err.message} | Attempts: ${attemptsMade}/${maxAttempts}`,
    );

    if (attemptsMade < maxAttempts || !userId) {
      return;
    }

    await this.notificationGateway.sendErrorNotification(
      userId.toString(),
      `Audio generation failed: ${err.message}`,
    );
  }
}
