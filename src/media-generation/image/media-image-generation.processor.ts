import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import {
  MEDIA_IMAGE_GENERATION_QUEUE,
  MEDIA_IMAGE_POLL_JOB,
  MEDIA_IMAGE_SUBMIT_JOB,
} from './media-image.constants';
import { MediaImageGenerationService } from './media-image-generation.service';

interface MediaImageGenerationJobData {
  requestId: string;
  attempt?: number;
}

@Injectable()
@Processor(MEDIA_IMAGE_GENERATION_QUEUE, {
  concurrency: 5,
  lockDuration: 900000,
})
export class MediaImageGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaImageGenerationProcessor.name);

  constructor(
    private readonly mediaImageGenerationService: MediaImageGenerationService,
  ) {
    super();
  }

  async process(job: Job<MediaImageGenerationJobData>) {
    const { requestId, attempt = 0 } = job.data;
    if (!requestId) {
      throw new Error('requestId is required for media image generation');
    }

    if (
      job.name === MEDIA_IMAGE_SUBMIT_JOB ||
      job.name === MEDIA_IMAGE_GENERATION_QUEUE
    ) {
      this.logger.log(`Submitting media image request ${requestId}`);
      return this.mediaImageGenerationService.processSubmitJob(requestId);
    }

    if (job.name === MEDIA_IMAGE_POLL_JOB) {
      this.logger.log(
        `Polling media image request ${requestId} (attempt ${attempt})`,
      );

      return this.mediaImageGenerationService.processPollJob(requestId, attempt);
    }

    throw new Error(`Unsupported media image job: ${job.name}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<MediaImageGenerationJobData>, error: Error) {
    this.logger.error(
      `Media image job ${job?.id ?? 'unknown'} failed: ${error.message}`,
      error.stack,
    );
  }
}
