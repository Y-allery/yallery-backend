import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { MoreThan, Repository } from 'typeorm';
import { FirebaseService } from 'src/integrations/firebase/firebase.service';
import { UserActivityEntity } from 'src/modules/engagement/user-activity/entities/user-activity.entity';
import { UserActivityService } from 'src/modules/engagement/user-activity/services/user-activity.service';
import { USER_ACTIVITY_TYPES } from 'src/modules/engagement/user-activity/types/user-activity.constants';
import { NotificationGateway } from 'src/modules/notifications/notification.gateway';
import { ContentTranslationService } from 'src/modules/translations/content-translation.service';
import {
  SupportedLocale,
  isSupportedLocale,
} from 'src/modules/translations/translation.catalog';
import { CONTEST_START_PUSH_TEMPLATES } from './contest-start-push.templates';
import { DeviceTokenEntity } from 'src/modules/users/entities/device-token.entity';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { ContestEntity } from '../entity/contest.entity';
import {
  CONTEST_START_NOTIFICATIONS_JOB_NAME,
  CONTEST_START_NOTIFICATIONS_QUEUE,
  ContestStartNotificationJobData,
} from './contest-start-notification.queue';

@Injectable()
export class ContestStartNotificationQueueService {
  private readonly logger = new Logger(ContestStartNotificationQueueService.name);
  private readonly userBatchSize = 100;
  private readonly notificationBatchSize = 10;

  constructor(
    @InjectQueue(CONTEST_START_NOTIFICATIONS_QUEUE)
    private readonly queue: Queue<ContestStartNotificationJobData>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(DeviceTokenEntity)
    private readonly deviceTokenRepository: Repository<DeviceTokenEntity>,
    @InjectRepository(UserActivityEntity)
    private readonly userActivityRepository: Repository<UserActivityEntity>,
    private readonly userActivityService: UserActivityService,
    private readonly firebaseService: FirebaseService,
    private readonly notificationGateway: NotificationGateway,
    private readonly contentTranslationService: ContentTranslationService,
  ) {}

  /** Push copy in the user's language with the translated contest name. */
  private async buildLocalizedPush(
    contestId: number,
    contestName: string,
    userLanguage: string | null | undefined,
  ): Promise<{ title: string; body: string }> {
    const locale: SupportedLocale =
      userLanguage && isSupportedLocale(userLanguage) ? userLanguage : 'en';
    const template = CONTEST_START_PUSH_TEMPLATES[locale];
    const { name } = await this.contentTranslationService.resolve(
      'contest',
      contestId,
      locale,
      { id: contestId, name: contestName },
      ['name'],
    );
    return {
      title: template.title,
      body: template.body.replace('{name}', name),
    };
  }

  async enqueueContestStarted(contest: ContestEntity) {
    const title = 'Join the contest!';
    const body = `The ${contest.name} contest is now live! Join now for a chance to win points!`;
    const jobId = this.getContestStartJobId(contest.id);

    await this.queue.add(
      CONTEST_START_NOTIFICATIONS_JOB_NAME,
      {
        contestId: contest.id,
        contestName: contest.name,
        contestType: contest.contestType,
        previewUrl: contest.imageUrl ?? null,
        title,
        body,
      },
      {
        jobId,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 30000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    return { jobId };
  }

  async processContestStarted(data: ContestStartNotificationJobData) {
    let lastUserId = 0;
    let totalProcessed = 0;
    let totalSkipped = 0;
    let totalSuccess = 0;
    let totalErrors = 0;

    while (true) {
      const users = await this.userRepository.find({
        where: {
          id: MoreThan(lastUserId),
          isDeleted: false,
          emailVerified: true,
        },
        relations: { deviceTokens: true },
        order: { id: 'ASC' },
        take: this.userBatchSize,
      });

      if (!users.length) {
        break;
      }

      lastUserId = users[users.length - 1].id;
      const eligibleUsers = await this.filterUsersWithoutContestOpenedActivity(
        data.contestId,
        users,
      );
      const skippedCount = users.length - eligibleUsers.length;
      totalSkipped += skippedCount;

      if (!eligibleUsers.length) {
        continue;
      }

      try {
        await this.userActivityService.logContestOpened({
          userIds: eligibleUsers.map((user) => user.id),
          contestId: data.contestId,
          contestName: data.contestName,
          contestType: data.contestType,
          previewUrl: data.previewUrl,
        });
      } catch (error) {
        totalErrors += eligibleUsers.length;
        this.logger.error(
          `Failed to create contest_opened activities for contest ${data.contestId}`,
          error?.stack ?? error?.message ?? String(error),
        );
        continue;
      }

      for (let i = 0; i < eligibleUsers.length; i += this.notificationBatchSize) {
        const batch = eligibleUsers.slice(i, i + this.notificationBatchSize);
        const results = await Promise.all(
          batch.map(async (user) => {
            try {
              const push = await this.buildLocalizedPush(
                data.contestId,
                data.contestName,
                user.language,
              );
              await this.sendPushNotifications(user, push.title, push.body);
              await this.notificationGateway.emitProfileUpdate(user.id.toString());
              return true;
            } catch (error) {
              this.logger.error(
                `Failed to process contest start notification for user ${user.id}`,
                error?.stack ?? error?.message ?? String(error),
              );
              return false;
            }
          }),
        );

        totalProcessed += batch.length;
        totalSuccess += results.filter(Boolean).length;
        totalErrors += results.filter((success) => !success).length;

        if (i + this.notificationBatchSize < eligibleUsers.length) {
          await this.sleep(50);
        }
      }
    }

    this.logger.log(
      `Contest ${data.contestId} start notifications finished: ${totalSuccess} success, ${totalErrors} errors, ${totalSkipped} skipped, ${totalProcessed} processed`,
    );
  }

  private async filterUsersWithoutContestOpenedActivity(
    contestId: number,
    users: UserEntity[],
  ) {
    const userIds = users.map((user) => user.id);
    if (!userIds.length) {
      return users;
    }

    const existingActivities = await this.userActivityRepository
      .createQueryBuilder('activity')
      .innerJoin('activity.user', 'user')
      .select('user.id', 'userId')
      .where('activity.type = :type', {
        type: USER_ACTIVITY_TYPES.CONTEST_OPENED,
      })
      .andWhere('activity.contestId = :contestId', { contestId })
      .andWhere('user.id IN (:...userIds)', { userIds })
      .getRawMany<{ userId: number }>();
    const alreadyNotifiedUserIds = new Set(
      existingActivities.map((activity) => Number(activity.userId)),
    );

    return users.filter((user) => !alreadyNotifiedUserIds.has(user.id));
  }

  private async sendPushNotifications(
    user: UserEntity,
    title: string,
    body: string,
  ) {
    if (!user.deviceTokens?.length) {
      return;
    }

    await Promise.all(
      user.deviceTokens.map(async (deviceToken) => {
        const result = await this.firebaseService.sendNotification(
          deviceToken.token,
          title,
          body,
        );

        if (!result.success && result.isInvalidToken) {
          await this.deviceTokenRepository.remove(deviceToken);
        }
      }),
    );
  }

  private getContestStartJobId(contestId: number) {
    return `${CONTEST_START_NOTIFICATIONS_JOB_NAME}:${contestId}`;
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
