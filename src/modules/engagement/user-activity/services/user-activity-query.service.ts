import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { startOfDay, subDays, subMonths, subWeeks, subYears } from 'date-fns';
import { ContestTypeEnum } from 'src/modules/contests/types/contest.status.enum';
import { UserActivityEntity } from '../entities/user-activity.entity';
import {
  UserActivityCategory,
  UserActivityFilter,
  UserActivityPeriod,
  USER_ACTIVITY_CATEGORIES,
  USER_ACTIVITY_FILTERS,
  USER_ACTIVITY_PERIODS,
  USER_ACTIVITY_TYPES,
} from '../types/user-activity.constants';
import { listUserActivityDescriptors } from 'src/modules/engagement/user-activity/config/user-activity.registry';

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
    limit?: number;
    beforeId?: number;
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
      // Tie-breaker so rows sharing a createdAt have a stable order. Note the
      // beforeId cursor assumes id order tracks createdAt order; MySQL assigns
      // both within the same INSERT, so that holds except for concurrent
      // same-user writes in the same microsecond. A strict keyset would need
      // the client to echo createdAt too — worth doing if the app ever pages.
      .addOrderBy('activity.id', 'DESC')
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

    // Deliberately unbounded by default: the mobile client has no paging UI and
    // sends no limit, so any default cap would silently drop the tail of a
    // heavy user's history. The period filter + (userId, createdAt) index bound
    // the scan. Once the app adopts limit/beforeId, give this a default.
    if (params.limit) {
      qb.take(params.limit);
    }

    if (params.beforeId) {
      qb.andWhere('activity.id < :beforeId', { beforeId: params.beforeId });
    }

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

  async markFeedAsRead(userId: number) {
    const result = await this.userActivityRepository
      .createQueryBuilder()
      .update(UserActivityEntity)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where('userId = :userId', { userId })
      .andWhere('isRead = false')
      .andWhere('type != :contestOpenedType', {
        contestOpenedType: USER_ACTIVITY_TYPES.CONTEST_OPENED,
      })
      .execute();

    return Number(result.affected ?? 0);
  }

  async markContestActivitiesAsReadByType(
    userId: number,
    contestType: ContestTypeEnum,
  ) {
    const result = await this.userActivityRepository
      .createQueryBuilder()
      .update(UserActivityEntity)
      .set({
        isRead: true,
        readAt: new Date(),
      })
      .where('userId = :userId', { userId })
      .andWhere('isRead = false')
      .andWhere('type = :contestOpenedType', {
        contestOpenedType: USER_ACTIVITY_TYPES.CONTEST_OPENED,
      })
      .andWhere(
        "JSON_UNQUOTE(JSON_EXTRACT(payload, '$.contestType')) = :contestType",
        { contestType },
      )
      .execute();

    return Number(result.affected ?? 0);
  }

  async countUnreadFeed(userId: number) {
    return await this.userActivityRepository
      .createQueryBuilder('activity')
      .where('activity.userId = :userId', { userId })
      .andWhere('activity.isRead = false')
      .andWhere('activity.type != :contestOpenedType', {
        contestOpenedType: USER_ACTIVITY_TYPES.CONTEST_OPENED,
      })
      .getCount();
  }

  async countUnreadContestActivitiesByType(
    userId: number,
    contestType: ContestTypeEnum,
  ) {
    return await this.userActivityRepository
      .createQueryBuilder('activity')
      .where('activity.userId = :userId', { userId })
      .andWhere('activity.isRead = false')
      .andWhere('activity.type = :contestOpenedType', {
        contestOpenedType: USER_ACTIVITY_TYPES.CONTEST_OPENED,
      })
      .andWhere(
        "JSON_UNQUOTE(JSON_EXTRACT(activity.payload, '$.contestType')) = :contestType",
        { contestType },
      )
      .getCount();
  }

}
