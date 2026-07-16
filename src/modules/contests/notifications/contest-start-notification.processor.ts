import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { ContestStartNotificationQueueService } from './contest-start-notification-queue.service';
import {
  CONTEST_START_NOTIFICATIONS_QUEUE,
  ContestStartNotificationJobData,
} from './contest-start-notification.queue';

@Injectable()
@Processor(CONTEST_START_NOTIFICATIONS_QUEUE, {
  concurrency: 1,
  lockDuration: 900000,
  // Unlike the admin broadcast (which fails on stall to avoid duplicate
  // mail-outs), this sweep checkpoints lastUserId into the job and marks each
  // user with a CONTEST_OPENED activity after their push, so resuming a
  // stalled run is safe. Allow several resumes before giving up — the default
  // of 1 meant a single deploy-restart abandoned the whole unsent tail.
  maxStalledCount: 5,
})
export class ContestStartNotificationProcessor extends WorkerHost {
  constructor(
    private readonly contestStartNotificationQueueService: ContestStartNotificationQueueService,
  ) {
    super();
  }

  async process(job: Job<ContestStartNotificationJobData>) {
    await this.contestStartNotificationQueueService.processContestStarted(
      job.data,
      job,
    );
  }
}
