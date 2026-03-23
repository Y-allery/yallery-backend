import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import {
  MEDIA_AUDIO_GENERATION_QUEUE,
  MEDIA_AUDIO_SUBMIT_JOB,
} from './media-audio.constants';
import { MediaAudioGenerationService } from './media-audio-generation.service';

@Injectable()
@Processor(MEDIA_AUDIO_GENERATION_QUEUE, {
  concurrency: 5,
  lockDuration: 900000,
})
export class MediaAudioGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaAudioGenerationProcessor.name);

  constructor(
    private readonly mediaAudioGenerationService: MediaAudioGenerationService,
  ) {
    super();
  }

  async process(job: Job<{ requestId: string }>) {
    const { requestId } = job.data;
    if (!requestId) {
      throw new Error('requestId is required for media audio generation');
    }

    if (
      job.name === MEDIA_AUDIO_SUBMIT_JOB ||
      job.name === MEDIA_AUDIO_GENERATION_QUEUE
    ) {
      this.logger.log(`Submitting media audio request ${requestId}`);
      return this.mediaAudioGenerationService.processSubmitJob(requestId);
    }

    throw new Error(`Unsupported media audio job: ${job.name}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<{ requestId: string }>, error: Error) {
    this.logger.error(
      `Media audio job ${job?.id ?? 'unknown'} failed: ${error.message}`,
      error.stack,
    );
  }
}
