import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { startOfDay, subDays, subMonths, subWeeks, subYears } from 'date-fns';
import { UserActivityEntity } from '../entities/user-activity.entity';
import {
  UserActivityCategory,
  UserActivityFilter,
  UserActivityPeriod,
  USER_ACTIVITY_CATEGORIES,
  USER_ACTIVITY_FILTERS,
  USER_ACTIVITY_PERIODS,
} from '../types/user-activity.constants';
import { listUserActivityDescriptors } from '../config/user-activity.registry';

@Injectable()
export class UserActivityQueryService {
  constructor(
    @InjectRepository(UserActivityEntity)
    private readonly userActivityRepository: Repository<UserActivityEntity>,
  ) {}

  getTypes() {
    return listUserActivityDescriptors().map((descriptor) => ({
      key: descriptor.key,
      category: descriptor.category,
      name: descriptor.name,
      description: descriptor.description,
    }));
  }

  async getUserActivities(params: {
    userId: number;
    filter?: UserActivityFilter;
    category?: UserActivityCategory;
    period?: UserActivityPeriod;
  }) {
    const now = new Date();
    const period = params.period ?? USER_ACTIVITY_PERIODS.WEEK;
    const filter = params.filter ?? USER_ACTIVITY_FILTERS.ALL;

    let dateFrom: Date;
    switch (period) {
      case USER_ACTIVITY_PERIODS.DAY:
        dateFrom = startOfDay(subDays(now, 1));
        break;
      case USER_ACTIVITY_PERIODS.MONTH:
        dateFrom = startOfDay(subMonths(now, 1));
        break;
      case USER_ACTIVITY_PERIODS.YEAR:
        dateFrom = startOfDay(subYears(now, 1));
        break;
      case USER_ACTIVITY_PERIODS.WEEK:
      default:
        dateFrom = startOfDay(subWeeks(now, 1));
        break;
    }

    const qb = this.userActivityRepository
      .createQueryBuilder('activity')
      .leftJoin('activity.actorUser', 'actorUser')
      .leftJoin('activity.post', 'post')
      .leftJoin('activity.contest', 'contest')
      .where('activity.userId = :userId', { userId: params.userId })
      .andWhere('activity.createdAt BETWEEN :dateFrom AND :now', {
        dateFrom,
        now,
      })
      .orderBy('activity.createdAt', 'DESC')
      .select([
        'activity.id',
        'activity.type',
        'activity.category',
        'activity.pointsDelta',
        'activity.descriptionSnapshot',
        'activity.payload',
        'activity.previewUrl',
        'activity.isRead',
        'activity.readAt',
        'activity.createdAt',
        'actorUser.id',
        'actorUser.nickname',
        'actorUser.avatar',
        'post.id',
        'contest.id',
        'contest.name',
      ]);

    if (params.category) {
      qb.andWhere('activity.category = :category', {
        category: params.category,
      });
    }

    if (filter === USER_ACTIVITY_FILTERS.EARNED) {
      qb.andWhere('activity.pointsDelta > 0');
    } else if (filter === USER_ACTIVITY_FILTERS.SPENT) {
      qb.andWhere('activity.pointsDelta < 0');
    }

    const activities = await qb.getMany();

    return activities.map((activity) => ({
      id: activity.id,
      activityType: activity.type,
      category: activity.category,
      pointsDelta: activity.pointsDelta,
      description: activity.descriptionSnapshot,
      previewUrl: activity.previewUrl,
      payload: activity.payload,
      isRead: activity.isRead,
      readAt: activity.readAt,
      createdAt: activity.createdAt,
      actorUser: activity.actorUser
        ? {
            id: activity.actorUser.id,
            nickname: activity.actorUser.nickname,
            avatar: activity.actorUser.avatar,
          }
        : null,
      post: activity.post ? { id: activity.post.id } : null,
      contest: activity.contest
        ? {
            id: activity.contest.id,
            name: activity.contest.name,
          }
        : null,
    }));
  }

  async markAllAsRead(userId: number) {
    await this.userActivityRepository.update(
      {
        user: { id: userId },
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      },
    );
  }

  async markContestActivitiesAsRead(userId: number) {
    await this.userActivityRepository.update(
      {
        user: { id: userId },
        isRead: false,
        category: USER_ACTIVITY_CATEGORIES.CONTEST,
      },
      {
        isRead: true,
        readAt: new Date(),
      },
    );
  }

  async countUnread(userId: number) {
    return await this.userActivityRepository.count({
      where: {
        user: { id: userId },
        isRead: false,
      },
    });
  }

  async countUnreadByCategory(userId: number, category: UserActivityCategory) {
    return await this.userActivityRepository.count({
      where: {
        user: { id: userId },
        isRead: false,
        category,
      },
    });
  }
}
