import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { NotificationGateway } from 'src/modules/notifications/notification.gateway';
import { UserNotificationTypeEnum } from 'src/modules/notifications/types/user-notification-type.enum';
import { UserService } from 'src/modules/users/user.service';
import {
  LIKE_NOTIFICATIONS_JOB_NAME,
  LIKE_NOTIFICATIONS_QUEUE,
  LikeNotificationJobData,
} from './like-notification.queue';

@Injectable()
export class LikeNotificationQueueService {
  private readonly logger = new Logger(LikeNotificationQueueService.name);

  constructor(
    @InjectQueue(LIKE_NOTIFICATIONS_QUEUE)
    private readonly queue: Queue<LikeNotificationJobData>,
    private readonly userService: UserService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  /**
   * Never rejects. The like is already committed by the time this runs, so a
   * Redis hiccup must cost the notification, not the like — the caller would
   * otherwise turn a successful write into a 400.
   */
  async enqueueLikeNotification(data: LikeNotificationJobData): Promise<void> {
    try {
      await this.queue.add(LIKE_NOTIFICATIONS_JOB_NAME, data, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        // Bounded so a broken FCM/socket path cannot grow the failed set
        // without limit during a launch spike.
        removeOnFail: 1000,
      });
    } catch (error) {
      this.logger.error(
        `Failed to enqueue like notification for post ${data.postId}: ${
          error?.message ?? error
        }`,
        error?.stack,
      );
    }
  }

  /**
   * Best-effort fan-out, mirroring what createLike used to do inline. Nothing
   * here rethrows: a rejected push or socket emit is a delivery problem, and
   * retrying the whole job would re-send the pushes that did succeed. Retries
   * are reserved for failures that abort the job outright (attempts: 3).
   */
  async processLikeNotification(data: LikeNotificationJobData): Promise<void> {
    const results = await Promise.allSettled([
      this.userService.sendPushNotificationIfEnabled(
        data.postOwnerId,
        UserNotificationTypeEnum.LIKE_EARN,
      ),
      this.userService.sendPushNotificationIfEnabled(
        data.likerId,
        UserNotificationTypeEnum.LIKE_SPEND,
      ),
      this.notificationGateway.emitProfileUpdate(data.likerId.toString()),
      this.notificationGateway.emitProfileUpdate(data.postOwnerId.toString()),
    ]);

    for (const result of results) {
      if (result.status === 'rejected') {
        // Only signal that push/socket delivery is broken — must reach the
        // Nest logger and Sentry, not raw stdout.
        this.logger.error(
          `like notification side effect failed for post ${data.postId}: ${
            result.reason?.message ?? result.reason
          }`,
          result.reason?.stack,
        );
      }
    }
  }
}
