import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  CONTENT_TRANSLATION_QUEUE,
  ContentTranslationJobData,
} from './content-translation.worker';
import { TranslatableEntityType } from './translation.catalog';

@Injectable()
export class ContentTranslationQueue {
  private readonly logger = new Logger(ContentTranslationQueue.name);

  constructor(
    @InjectQueue(CONTENT_TRANSLATION_QUEUE)
    private readonly queue: Queue<ContentTranslationJobData>,
  ) {}

  /** Fire-and-forget: content creation must never fail because of translation. */
  async enqueue(
    entityType: TranslatableEntityType,
    entityId: number,
  ): Promise<void> {
    try {
      await this.queue.add(
        `${entityType}-${entityId}`,
        { entityType, entityId },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 10000 },
          removeOnComplete: 100,
          removeOnFail: 100,
          // Re-translating the same entity twice is harmless; dedupe bursts.
          jobId: `${entityType}-${entityId}-${Date.now()}`,
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to enqueue translation for ${entityType}#${entityId}: ${(error as Error).message}`,
      );
    }
  }
}
