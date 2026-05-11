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
    );
  }
}
