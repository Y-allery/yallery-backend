import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { LikeNotificationQueueService } from './like-notification-queue.service';
import {
  LIKE_NOTIFICATIONS_QUEUE,
  LikeNotificationJobData,
} from './like-notification.queue';

@Injectable()
@Processor(LIKE_NOTIFICATIONS_QUEUE, {
  // One job is two pushes plus two profile emits, all I/O bound, so the single
  // API process can overlap several. Kept modest on purpose: the same process
  // serves HTTP, and a like burst must not starve it.
  concurrency: 10,
})
export class LikeNotificationProcessor extends WorkerHost {
  constructor(
    private readonly likeNotificationQueueService: LikeNotificationQueueService,
  ) {
    super();
  }

  async process(job: Job<LikeNotificationJobData>) {
    await this.likeNotificationQueueService.processLikeNotification(job.data);
  }
}
