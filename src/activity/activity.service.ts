import { Injectable } from '@nestjs/common';
import { ActivityEnum } from './types/activity.enum';
import { ActivityEntity } from './entities/activity.entity';
import { Between, In, Not, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { subDays, subWeeks, subMonths, subYears, startOfDay } from 'date-fns';
import { ContestEntity } from 'src/contest/entity/contest.entity';
import { PostEntity } from 'src/post/entities/post.entity';
import { NotificationPreferenceEntity } from 'src/notification/entity/notification.preferences.entity';
import { PaginatioDto } from 'src/common/dto/pagination.dto';
import { AIEnum } from 'src/common/enums/ai.enum';
import { ContestTypeEnum } from 'src/contest/types/contest.status.enum';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { RewardService } from 'src/reward/reward.service';
import { RewardTypeEnum } from 'src/reward/types/reward-type.enum';

type CreateActivitiesOptions = {
  fromUserId: number | null;
  toUserIds: number[];
  type: ActivityEnum;
  contestReward?: number;
  isAdmin?: boolean;
  contest?: ContestEntity;
  post?: PostEntity;
  /**
   * Points/cost that comes from external calculation (e.g. ai_settings cost).
   * Used for IMAGE/VIDEO_GENERATE_SPEND.
   */
  generationCost?: number;
  /**
   * @deprecated Not persisted in `activity` table and not used for points/message building.
   * Kept only for backward compatibility with existing call sites.
   */
  service?: AIEnum;
};

const ACTIVITY_TO_REWARD_TYPE: Partial<Record<ActivityEnum, RewardTypeEnum>> = {
  [ActivityEnum.LIKE_EARN]: RewardTypeEnum.LIKE_EARN,
  [ActivityEnum.LIKE_SPEND]: RewardTypeEnum.LIKE_SPEND,
  [ActivityEnum.DAILY_REWARD]: RewardTypeEnum.DAILY_LOGIN,
  [ActivityEnum.SHARE_REWARD]: RewardTypeEnum.SHARE_REWARD,
};

@Injectable()
export class ActivityService {
  private readonly rewardPointsCache = new Map<
    RewardTypeEnum,
    { points: number; expiresAt: number }
  >();

  constructor(
    @InjectRepository(ActivityEntity)
    private activityRepository: Repository<ActivityEntity>,
    @InjectRepository(NotificationPreferenceEntity)
    private notificationPreferenceRepository: Repository<NotificationPreferenceEntity>,
    private readonly notificationGateway: NotificationGateway,
    private readonly rewardService: RewardService,
  ) {}

  private buildActivityMessage(
    type: ActivityEnum,
    points: number,
    contest?: ContestEntity,
  ): string {
    const messages = {
      [ActivityEnum.LIKE_EARN]: `You earned ${points} YEPs for a like`,
      [ActivityEnum.LIKE_SPEND]: `You spent ${points} YEPs on a like`,
      [ActivityEnum.IMAGE_GENERATE_SPEND]: `You spent ${points} YEPs on image generation`,
      [ActivityEnum.VIDEO_GENERATE_SPEND]: `You spent ${points} YEPs on video generation`,
      [ActivityEnum.CONTEST_OPEN]: `The contest ${contest?.name} is now open! Join us for an exciting challenge and show off your skills.`,
      [ActivityEnum.CONTEST_CLOSE]: `The contest is closed. Unfortunately, you didn't win a prize this time`,
      [ActivityEnum.CONTEST_WIN]: `Congratulations! You won first place in the ${contest?.name} contest and received a reward of ${points} YEPs`,
      [ActivityEnum.DAILY_REWARD]: `You received a daily login reward of ${points} YEPs`,
      [ActivityEnum.SHARE_REWARD]: `You received a reward of ${points} YEPs for invite new users`,
      [ActivityEnum.ADMIN_REPORT]: `A new report has been submitted for review`,
      [ActivityEnum.ADMIN_CONTEST_REVIEW]: `A contest review has been initiated`,
      [ActivityEnum.ADMIN_REPORT_REVIEW]: `A report review has been completed`,
      [ActivityEnum.ADMIN_CONTEST_WON]: `The contest result has been finalized and the winners have been announced`,
    };
    return messages[type];
  }

  private getRewardTypeForActivity(type: ActivityEnum): RewardTypeEnum | null {
    return ACTIVITY_TO_REWARD_TYPE[type] ?? null;
  }

  private normalizeToUserIds(toUserIds: number[]): number[] {
    // de-dupe + drop invalid ids
    const normalized = Array.from(new Set(toUserIds))
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);
    return normalized;
  }

  private normalizePoints(points: number): number {
    const n = Number(points);
    if (!Number.isFinite(n) || n < 0) {
      return 0;
    }
    return n;
  }

  private async getRewardPointsCached(rewardType: RewardTypeEnum): Promise<number> {
    const now = Date.now();
    const cached = this.rewardPointsCache.get(rewardType);
    if (cached && cached.expiresAt > now) {
      return cached.points;
    }
    const points = await this.rewardService.getRewardPointsOrDefault(rewardType, 0);
    // short TTL to reduce DB hits without risking stale config for too long
    this.rewardPointsCache.set(rewardType, { points, expiresAt: now + 60_000 });
    return points;
  }

  private async resolveActivityPoints(opts: CreateActivitiesOptions): Promise<number> {
    const { type } = opts;
    if (
      type === ActivityEnum.IMAGE_GENERATE_SPEND ||
      type === ActivityEnum.VIDEO_GENERATE_SPEND
    ) {
      // cost comes from ai_settings (computed by caller)
      return this.normalizePoints(opts.generationCost ?? 0);
    }
    if (type === ActivityEnum.CONTEST_WIN) {
      // contest win is dynamic (contest.reward)
      return this.normalizePoints(opts.contestReward ?? 0);
    }

    const rewardType = this.getRewardTypeForActivity(type);
    if (!rewardType) {
      // admin/system activities, contest open/close etc.
      return 0;
    }
    return this.normalizePoints(await this.getRewardPointsCached(rewardType));
  }

  async createActivitiesV2(opts: CreateActivitiesOptions): Promise<string> {
    const toUserIds = this.normalizeToUserIds(opts.toUserIds ?? []);
    const points = await this.resolveActivityPoints(opts);
    const description = this.buildActivityMessage(opts.type, points, opts.contest);

    if (toUserIds.length === 0) {
      // keep previous behavior: return message even if nothing is written
      return description;
    }

    const activities = toUserIds.map((toUserId) =>
      this.activityRepository.create({
        fromUser: opts.fromUserId != null ? { id: opts.fromUserId } : null,
        toUser: { id: toUserId },
        activityType: opts.type,
        description,
        points,
        isAdmin: !!opts.isAdmin,
        contest: opts.contest,
        post: opts.post,
      }),
    );

    // Save in chunks for safety/perf when there are many recipients.
    await this.activityRepository.save(activities, { chunk: 500 });
    return description;
  }

  // NOTE: legacy positional createActivities/getPointsForActivity removed after full migration to createActivitiesV2.

  async deleteAdminContestActivity(contest_id: number) {
    const activities = await this.activityRepository.find({
      where: {
        isAdmin: true,
        activityType: In([ActivityEnum.ADMIN_CONTEST_REVIEW]),
        contest: { id: contest_id },
      },
    });
    await this.activityRepository.remove(activities);
  }

  async deleteAdminPostActivity(post_id: number, from_user: number) {
    const activities = await this.activityRepository.find({
      where: {
        isAdmin: true,
        activityType: In([ActivityEnum.ADMIN_REPORT]),
        post: { id: post_id },
        fromUser: { id: from_user },
      },
    });
    await this.activityRepository.remove(activities);
  }
  async getFilteredActivities(
    userId: number,
    filter: 'earned' | 'spent',
    period: 'day' | 'week' | 'month' | 'year',
  ): Promise<
    Array<{
      id: number;
      activityType: ActivityEnum;
      description: string;
      createdAt: Date;
      points: number;
      /**
       * Image to display for this activity:
       * - if post has imageUrl -> imageUrl
       * - else if post is video -> previewImageUrl
       */
      imageUrl: string | null;
    }>
  > {
    const earnedTypes = [
      ActivityEnum.LIKE_EARN,
      ActivityEnum.DAILY_REWARD,
      ActivityEnum.SHARE_REWARD,
      ActivityEnum.CONTEST_WIN,
    ];
    const spentTypes = [
      ActivityEnum.LIKE_SPEND,
      ActivityEnum.IMAGE_GENERATE_SPEND,
      ActivityEnum.CONTEST_CLOSE,
    ];
    const activityTypes = filter === 'earned' ? earnedTypes : spentTypes;

    let dateFrom: Date;
    const now = new Date();

    switch (period) {
      case 'day':
        dateFrom = startOfDay(subDays(now, 1));
        break;
      case 'week':
        dateFrom = startOfDay(subWeeks(now, 1));
        break;
      case 'month':
        dateFrom = startOfDay(subMonths(now, 1));
        break;
      case 'year':
        dateFrom = startOfDay(subYears(now, 1));
        break;
      default:
        dateFrom = new Date(0);
        break;
    }

    const activities = await this.activityRepository
      .createQueryBuilder('activity')
      .leftJoin('activity.post', 'post')
      .where('activity.toUserId = :userId', { userId })
      .andWhere('activity.activityType IN (:...types)', { types: activityTypes })
      .andWhere('activity.createdAt BETWEEN :dateFrom AND :now', {
        dateFrom,
        now,
      })
      .orderBy('activity.createdAt', 'DESC')
      .select([
        'activity.id',
        'activity.activityType',
        'activity.description',
        'activity.createdAt',
        'activity.points',
        'post.imageUrl',
        'post.videoUrl',
        'post.previewImageUrl',
      ])
      .getMany();

    return activities.map((a) => {
      const post = a.post as any;
      const imageUrl =
        post?.imageUrl ?? (post?.videoUrl ? post?.previewImageUrl ?? null : null);
      return {
        id: a.id,
        activityType: a.activityType,
        description: a.description,
        createdAt: a.createdAt,
        points: a.points,
        imageUrl,
      };
    });
  }

  async getAdminActiveNotifications(dto: PaginatioDto) {
    const { page, limit } = dto;
    const [data, count] = await this.activityRepository.findAndCount({
      select: {
        id: true,
        activityType: true,
        description: true,
        isAdmin: true,
        createdAt: true,
        contest: { id: true, name: true },
        post: { id: true, user: { name: true, email: true, avatar: true } },
      },
      where: {
        isAdmin: true,
        activityType: In([
          ActivityEnum.ADMIN_CONTEST_REVIEW,
          ActivityEnum.ADMIN_REPORT,
        ]),
      },
      relations: { contest: true, post: { user: true } },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    };
  }

  async getAdminArchiveNotifications(dto: PaginatioDto) {
    const { page, limit } = dto;
    const [data, count] = await this.activityRepository.findAndCount({
      select: {
        id: true,
        activityType: true,
        description: true,
        isAdmin: true,
        createdAt: true,
        contest: { id: true, name: true },
        post: { id: true, user: { nickname: true } },
      },
      where: {
        isAdmin: true,
        activityType: In([
          ActivityEnum.ADMIN_CONTEST_WON,
          ActivityEnum.ADMIN_REPORT_REVIEW,
        ]),
      },
      relations: { contest: true, post: true },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    };
  }

  async getPaginatedActivitiesForUser(
    userId: number,
    skip: number = 0,
    take: number = 10,
  ): Promise<ActivityEntity[]> {
    const adminActivities = [
      ActivityEnum.ADMIN_REPORT,
      ActivityEnum.ADMIN_CONTEST_REVIEW,
      ActivityEnum.ADMIN_REPORT_REVIEW,
      ActivityEnum.ADMIN_CONTEST_WON,
    ];

    const activities = await this.activityRepository.find({
      where: {
        toUser: { id: userId },
        activityType: Not(In(adminActivities)),
      },
      order: {
        isRead: 'ASC',
        createdAt: 'DESC',
      },
      relations: { contest: true, post: true },
      skip: skip,
      take: take,
    });

    return activities;
  }
  async markAllActivitiesAsRead(userId: number): Promise<void> {
    const valueToRemove = ActivityEnum.CONTEST_OPEN;
    const valuesArray = Object.values(ActivityEnum) as string[];

    const filteredArray = valuesArray.filter(
      (value) => value !== valueToRemove,
    );
    const newArray = [...filteredArray];

    const activities = await this.activityRepository.find({
      where: {
        toUser: { id: userId },
        isRead: false,
        activityType: In(newArray),
      },
    });

    if (activities.length > 0) {
      activities.forEach((activity) => {
        activity.isRead = true;
      });
      await this.activityRepository.save(activities);
    }

    await this.notificationGateway.emitProfileUpdate(userId.toString());
  }

  async markContestActivityAsRead(userId: number) {
    const activities = await this.activityRepository.find({
      where: {
        toUser: { id: userId },
        isRead: false,
        activityType: ActivityEnum.CONTEST_OPEN,
        contest: { contestType: ContestTypeEnum.DEFAULT },
      },
      relations: { contest: true },
    });

    if (activities.length > 0) {
      activities.forEach((activity) => {
        activity.isRead = true;
      });
      await this.activityRepository.save(activities);
    }
    await this.notificationGateway.emitProfileUpdate(userId.toString());
  }

  async markContestCollabsAsRead(userId: number) {
    const activities = await this.activityRepository.find({
      where: {
        toUser: { id: userId },
        isRead: false,
        activityType: ActivityEnum.CONTEST_OPEN,
        contest: { contestType: ContestTypeEnum.FINE_TUNE },
      },
      relations: { contest: true },
    });

    if (activities.length > 0) {
      activities.forEach((activity) => {
        activity.isRead = true;
      });
      await this.activityRepository.save(activities);
    }
    await this.notificationGateway.emitProfileUpdate(userId.toString());
  }

  async getNotificationPreferences(
    userId: number,
    types: ActivityEnum[],
  ): Promise<any> {
    const preferences = await this.notificationPreferenceRepository.find({
      where: {
        user: { id: userId },
        activityType: In(types),
      },
    });

    const defaultDescriptions = {
      LIKE_EARN: 'Like earn notification can be disabled.',
      LIKE_SPEND: 'Like spend notification can be disabled.',
    };

    return types.map((type) => ({
      key: type,
      description: defaultDescriptions[type],
      enabled: preferences.some((p) => p.activityType === type && p.enabled),
    }));
  }

  async countUnreadActivities(userId: number): Promise<number> {
    return this.activityRepository.count({
      where: { toUser: { id: userId }, isRead: false },
    });
  }

  async countUnreadContestActivities(userId: number): Promise<number> {
    return this.activityRepository
      .createQueryBuilder('activity')
      .innerJoin('activity.contest', 'contest')
      .where('activity.toUser = :userId', { userId })
      .andWhere('activity.isRead = :isRead', { isRead: false })
      .andWhere('activity.activityType = :activityType', {
        activityType: ActivityEnum.CONTEST_OPEN,
      })
      .andWhere('contest.contestType = :contestType', {
        contestType: ContestTypeEnum.DEFAULT,
      })
      .getCount();
  }

  async countUnreadCollabsActivities(userId: number): Promise<number> {
    return this.activityRepository
      .createQueryBuilder('activity')
      .innerJoin('activity.contest', 'contest')
      .where('activity.toUser = :userId', { userId })
      .andWhere('activity.isRead = :isRead', { isRead: false })
      .andWhere('activity.activityType = :activityType', {
        activityType: ActivityEnum.CONTEST_OPEN,
      })
      .andWhere('contest.contestType = :contestType', {
        contestType: ContestTypeEnum.FINE_TUNE,
      })
      .getCount();
  }

  async hasReceivedDailyRewardToday(userId: number): Promise<boolean> {
    // Використовуємо нову систему перевірки клеймованих нагород
    return this.rewardService.hasClaimedRewardToday(userId, RewardTypeEnum.DAILY_LOGIN);
  }

}
