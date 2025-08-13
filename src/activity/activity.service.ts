import { Injectable } from '@nestjs/common';
import { ActivityEnum } from './types/activity.enum';
import { ActivityEntity } from './entities/activity.entity';
import { Between, In, Not, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { subDays, subWeeks, subMonths, subYears, startOfDay } from 'date-fns';
import { ContestEntity } from 'src/contest/entity/contest.entity';
import { PostEntity } from 'src/post/entities/post.entity';
import { NotificationPreferenceEntity } from 'src/notification/entity/notification.preferences.entity';
import { PaginatioDto } from 'src/common/dto/pagination.dto';
import { AIEnum } from 'src/common/enums/ai.enum';
import { ContestTypeEnum } from 'src/contest/types/contest.status.enum';
import { NotificationGateway } from 'src/notification/notification.gateway';

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(ActivityEntity)
    private activityRepository: Repository<ActivityEntity>,
    private readonly configService: ConfigService,
    @InjectRepository(NotificationPreferenceEntity)
    private notificationPreferenceRepository: Repository<NotificationPreferenceEntity>,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  getActivityMessage(
    type: ActivityEnum,
    generationCost?: number,
    contest?: ContestEntity,
  ): string {
    const messages = {
      [ActivityEnum.LIKE_EARN]: `You earned ${this.configService.get('LIKE_EARN_YEPS')} YEPs for a like`,
      [ActivityEnum.LIKE_SPEND]: `You spent ${this.configService.get('LIKE_SPEND_YEPS')} YEPs on a like`,
      [ActivityEnum.IMAGE_GENERATE_SPEND]: `You spent ${generationCost || this.configService.get('IMAGE_GENERATE_COST_YEPS')} YEPs on image generation`,
      [ActivityEnum.VIDEO_GENERATE_SPEND]: `You spent ${generationCost || this.configService.get('VIDEO_GENERATE_COST_YEPS')} YEPs on video generation`,
      [ActivityEnum.CONTEST_OPEN]: `The contest ${contest?.name} is now open! Join us for an exciting challenge and show off your skills.`,
      [ActivityEnum.CONTEST_CLOSE]: `The contest is closed. Unfortunately, you didn't win a prize this time`,
      [ActivityEnum.CONTEST_WIN]: `Congratulations! You won first place in the ${contest?.name} contest and received a reward of ${generationCost} YEPs`,
      [ActivityEnum.DAILY_REWARD]: `You received a daily reward of ${this.configService.get('DAILY_REWARD_YEPS')} YEPs`,
      [ActivityEnum.SHARE_REWARD]: `You received a reward of ${this.configService.get('SHARING_REWARD_YEPS')} YEPs for invite new users`,
      [ActivityEnum.ADMIN_REPORT]: `A new report has been submitted for review`,
      [ActivityEnum.ADMIN_CONTEST_REVIEW]: `A contest review has been initiated`,
      [ActivityEnum.ADMIN_REPORT_REVIEW]: `A report review has been completed`,
      [ActivityEnum.ADMIN_CONTEST_WON]: `The contest result has been finalized and the winners have been announced`,
      [ActivityEnum.TOP_POST_REWARD_AUTHOR]: `Congratulations! Your post was the most liked in its tag today. You received a reward of 100 YEPs as the author!`,
      [ActivityEnum.TOP_POST_REWARD_LIKER]: `You received a share of the reward for liking the most popular post!`,
    };
    return messages[type];
  }

  async createActivities(
    fromUserId: number | null,
    toUserIds: number[],
    type: ActivityEnum,
    contest_reward?: number,
    is_admin: boolean = false,
    contest?: ContestEntity,
    post?: PostEntity,
    service?: AIEnum,
    generation_cost?: number,
  ) {
    const points =
      type === ActivityEnum.IMAGE_GENERATE_SPEND ||
      type === ActivityEnum.VIDEO_GENERATE_SPEND
        ? generation_cost
        : this.getPointsForActivity(type, contest_reward);

    const description = this.getActivityMessage(type, points, contest);
    const activities = toUserIds.map((toUserId) =>
      this.activityRepository.create({
        fromUser: fromUserId ? { id: fromUserId } : null,
        toUser: { id: toUserId },
        activityType: type,
        description,
        points,
        is_admin,
        contest,
        post,
      }),
    );

    await this.activityRepository.save(activities);

    return description;
  }
  async deleteAdminContestActivity(contest_id: number) {
    const activities = await this.activityRepository.find({
      where: {
        is_admin: true,
        activityType: In([ActivityEnum.ADMIN_CONTEST_REVIEW]),
        contest: { id: contest_id },
      },
    });
    await this.activityRepository.remove(activities);
  }

  async deleteAdminPostActivity(post_id: number, from_user: number) {
    const activities = await this.activityRepository.find({
      where: {
        is_admin: true,
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
  ): Promise<ActivityEntity[]> {
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

    return this.activityRepository.find({
      where: {
        toUser: { id: userId },
        activityType: In(activityTypes),
        createdAt: Between(dateFrom, now),
      },
      order: { createdAt: 'DESC' },
      select: ['id', 'activityType', 'description', 'createdAt', 'points'],
    });
  }

  getPointsForActivity(type: ActivityEnum, contest_reward?: number): number {
    switch (type) {
      case ActivityEnum.LIKE_EARN:
        return +this.configService.get('LIKE_EARN_YEPS');
      case ActivityEnum.LIKE_SPEND:
        return +this.configService.get('LIKE_SPEND_YEPS');
      case ActivityEnum.IMAGE_GENERATE_SPEND:
        return +this.configService.get('IMAGE_GENERATE_SPEND_YEPS');
      case ActivityEnum.DAILY_REWARD:
        return +this.configService.get('DAILY_REWARD_YEPS');
      case ActivityEnum.SHARE_REWARD:
        return +this.configService.get('SHARE_REWARD_YEPS');
      case ActivityEnum.CONTEST_WIN:
        return contest_reward || 0;
      default:
        return 0;
    }
  }

  async getAdminActiveNotifications(dto: PaginatioDto) {
    const { page, limit } = dto;
    const [data, count] = await this.activityRepository.findAndCount({
      select: {
        id: true,
        activityType: true,
        description: true,
        is_admin: true,
        createdAt: true,
        contest: { id: true, name: true },
        post: { id: true, user: { name: true, email: true, avatar: true } },
      },
      where: {
        is_admin: true,
        activityType: In([
          ActivityEnum.ADMIN_CONTEST_REVIEW,
          ActivityEnum.ADMIN_REPORT,
        ]),
      },
      relations: { contest: true, post: { user: true } },
      skip: (page - 1) * limit, // Skip the records to get to the correct page
      take: limit, // Limit the number of results per page
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
        is_admin: true,
        createdAt: true,
        contest: { id: true, name: true },
        post: { id: true, user: { nickname: true } },
      },
      where: {
        is_admin: true,
        activityType: In([
          ActivityEnum.ADMIN_CONTEST_WON,
          ActivityEnum.ADMIN_REPORT_REVIEW,
        ]),
      },
      relations: { contest: true, post: true },
      skip: (page - 1) * limit, // Skip the records to get to the correct page
      take: limit, // Limit the number of results per page
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
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
    const todayEnd = new Date(new Date().setHours(23, 59, 59, 999));

    console.log(`🔍 Checking daily reward for user ${userId}:`, {
      todayStart: todayStart.toISOString(),
      todayEnd: todayEnd.toISOString(),
    });

    const dailyRewardActivity = await this.activityRepository.findOne({
      where: {
        toUser: { id: userId },
        activityType: ActivityEnum.DAILY_REWARD,
        createdAt: Between(todayStart, todayEnd),
      },
    });

    const hasReceived = !!dailyRewardActivity;
    console.log(`🔍 User ${userId} daily reward status:`, {
      hasReceived,
      activityFound: dailyRewardActivity ? {
        id: dailyRewardActivity.id,
        createdAt: dailyRewardActivity.createdAt,
        points: dailyRewardActivity.points,
      } : null,
    });

    return hasReceived;
  }
}
