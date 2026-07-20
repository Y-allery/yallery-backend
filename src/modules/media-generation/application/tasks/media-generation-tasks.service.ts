import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { MoreThan, Repository } from 'typeorm';
import { MediaGenerationChargeEntity } from 'src/modules/media-generation/persistence/entities/media-generation-charge.entity';
import {
  MEDIA_AUDIO_GENERATION_QUEUE,
  MEDIA_IMAGE_EDIT_GENERATION_QUEUE,
  MEDIA_IMAGE_VIDEO_GENERATION_QUEUE,
  MEDIA_MEME_GENERATION_QUEUE,
  MEDIA_PROMPT_IMAGE_GENERATION_QUEUE,
  MEDIA_TEXT_VIDEO_GENERATION_QUEUE,
} from 'src/modules/media-generation/infrastructure/queues/constants/media-generation.queue';

export type UserGenerationTaskStatus = 'processing' | 'failed';

export interface UserGenerationTask {
  taskId: string;
  status: UserGenerationTaskStatus;
  aiService: string | null;
  createdAt: Date;
}

/**
 * Tells a client which of its generations are still running and which died,
 * so a session that missed the websocket events (app restart, lost
 * connection) can rebuild its UI instead of leaving spinners up forever.
 *
 * The answer is assembled from two sources because neither alone is complete:
 *
 *  - media_generation_charges maps userId -> taskId. A refunded charge is an
 *    authoritative "this generation failed", since credits are only returned
 *    when the job gave up.
 *  - the queues hold the live state. Jobs are enqueued with removeOnComplete,
 *    so a reserved charge whose job is gone is a job that SUCCEEDED — its
 *    result already reached the client, or is waiting in the undelivered
 *    channel, and it is deliberately left out of this response.
 */
@Injectable()
export class MediaGenerationTasksService {
  private readonly logger = new Logger(MediaGenerationTasksService.name);
  private readonly queues: Queue[];

  /** How far back a generation can still be interesting to a client session. */
  private static readonly LOOKBACK_HOURS = 24;
  /** Ceiling on rows scanned, so a heavy user cannot make this expensive. */
  private static readonly MAX_TASKS = 50;

  constructor(
    @InjectRepository(MediaGenerationChargeEntity)
    private readonly chargeRepository: Repository<MediaGenerationChargeEntity>,
    @InjectQueue(MEDIA_PROMPT_IMAGE_GENERATION_QUEUE) promptImage: Queue,
    @InjectQueue(MEDIA_IMAGE_EDIT_GENERATION_QUEUE) imageEdit: Queue,
    @InjectQueue(MEDIA_AUDIO_GENERATION_QUEUE) audio: Queue,
    @InjectQueue(MEDIA_MEME_GENERATION_QUEUE) meme: Queue,
    @InjectQueue(MEDIA_TEXT_VIDEO_GENERATION_QUEUE) textVideo: Queue,
    @InjectQueue(MEDIA_IMAGE_VIDEO_GENERATION_QUEUE) imageVideo: Queue,
  ) {
    this.queues = [promptImage, imageEdit, audio, meme, textVideo, imageVideo];
  }

  async getUnfinishedTasks(userId: number): Promise<UserGenerationTask[]> {
    const since = new Date(
      Date.now() -
        MediaGenerationTasksService.LOOKBACK_HOURS * 60 * 60 * 1000,
    );

    const charges = await this.chargeRepository.find({
      where: { userId, createdAt: MoreThan(since) },
      order: { createdAt: 'DESC' },
      take: MediaGenerationTasksService.MAX_TASKS,
    });

    const tasks = await Promise.all(
      charges
        .filter((charge) => charge.jobId)
        .map(async (charge) => {
          const status = await this.resolveStatus(charge);
          return status
            ? {
                taskId: charge.jobId!,
                status,
                aiService: charge.aiService,
                createdAt: charge.createdAt,
              }
            : null;
        }),
    );

    return tasks.filter((task): task is UserGenerationTask => task !== null);
  }

  /** Null means finished successfully — nothing for the client to act on. */
  private async resolveStatus(
    charge: MediaGenerationChargeEntity,
  ): Promise<UserGenerationTaskStatus | null> {
    // A refund only happens after the job exhausted its attempts, so this is
    // the one signal that needs no queue lookup.
    if (charge.status === 'refunded') {
      return 'failed';
    }

    const state = await this.findJobState(charge.jobId!);
    if (state === null) {
      // removeOnComplete deleted it: the generation succeeded.
      return null;
    }
    return state === 'failed' ? 'failed' : 'processing';
  }

  private async findJobState(taskId: string): Promise<string | null> {
    for (const queue of this.queues) {
      try {
        const job = await queue.getJob(taskId);
        if (job) {
          return await job.getState();
        }
      } catch (error) {
        // A queue being unreachable must not turn into a false "succeeded";
        // report it as still processing by surfacing an unknown-but-present
        // state, and let the next poll settle it.
        this.logger.warn(
          `Queue ${queue.name} lookup failed for task ${taskId}: ${
            error?.message ?? error
          }`,
        );
        return 'unknown';
      }
    }
    return null;
  }
}
