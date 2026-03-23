import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import {
  MEDIA_VIDEO_GENERATION_QUEUE,
  MEDIA_VIDEO_SUBMIT_JOB,
} from './media-video.constants';
import { MediaVideoGenerationService } from './media-video-generation.service';

@Injectable()
@Processor(MEDIA_VIDEO_GENERATION_QUEUE, {
  concurrency: 5,
  lockDuration: 900000,
})
export class MediaVideoGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaVideoGenerationProcessor.name);

  constructor(
    private readonly mediaVideoGenerationService: MediaVideoGenerationService,
  ) {
    super();
  }

  async process(job: Job<{ requestId: string }>) {
    const { requestId } = job.data;
    if (!requestId) {
      throw new Error('requestId is required for media video generation');
    }

    if (
      job.name === MEDIA_VIDEO_SUBMIT_JOB ||
      job.name === MEDIA_VIDEO_GENERATION_QUEUE
    ) {
      this.logger.log(`Submitting media video request ${requestId}`);
      return this.mediaVideoGenerationService.processSubmitJob(requestId);
    }

    throw new Error(`Unsupported media video job: ${job.name}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<{ requestId: string }>, error: Error) {
    this.logger.error(
      `Media video job ${job?.id ?? 'unknown'} failed: ${error.message}`,
      error.stack,
    );
  }
}
