import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { BroadcastNotificationDto } from 'src/modules/admin/dto/broadcast-notification.dto';
import {
  ADMIN_BROADCAST_QUEUE,
  AdminBroadcastJobData,
} from './admin-broadcast.processor';

@Injectable()
export class AdminBroadcastService {
  private readonly logger = new Logger(AdminBroadcastService.name);

  constructor(
    @InjectQueue(ADMIN_BROADCAST_QUEUE)
    private readonly broadcastQueue: Queue<AdminBroadcastJobData>,
  ) {}

  async broadcastNotification(dto: BroadcastNotificationDto) {
    const { type, title, body, emailSubject } = dto;

    const job = await this.broadcastQueue.add(
      'broadcast',
      { type, title, body, emailSubject },
      {
        // Never retry a whole broadcast: a mid-run failure would re-send
        // notifications to users that were already processed.
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );

    this.logger.log(
      `Queued ${type} notification broadcast "${title}" as job ${job.id}`,
    );

    return {
      success: true,
      type,
      jobId: job.id,
      message: `${type} notification broadcast queued`,
    };
  }
}
