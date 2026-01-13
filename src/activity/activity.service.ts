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
import { UserEntity } from 'src/user/entities/user.entity';
import { PopularPostsResponse } from './types/popular-post.interface';
import { ViewedPostEntity } from 'src/post/entities/viwed.entity';
import { RewardService } from 'src/reward/reward.service';
import { RewardTypeEnum } from 'src/reward/types/reward-type.enum';

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(ActivityEntity)
    private activityRepository: Repository<ActivityEntity>,
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    @InjectRepository(PostEntity)
    private postRepository: Repository<PostEntity>,
    private readonly configService: ConfigService,
    @InjectRepository(NotificationPreferenceEntity)
    private notificationPreferenceRepository: Repository<NotificationPreferenceEntity>,
    @InjectRepository(ViewedPostEntity)
    private viewedPostRepository: Repository<ViewedPostEntity>,
    private readonly notificationGateway: NotificationGateway,
    private readonly rewardService: RewardService,
  ) {}

  async getActivityMessage(
    type: ActivityEnum,
    generationCost?: number,
    contest?: ContestEntity,
  ): Promise<string> {
    // Отримуємо значення з RewardService для fallback, якщо generationCost не передано
    let points = generationCost;
    
    if (!generationCost) {
      switch (type) {
        case ActivityEnum.LIKE_EARN:
          points = await this.rewardService.getRewardPointsOrDefault(RewardTypeEnum.LIKE_EARN, 5);
          break;
        case ActivityEnum.LIKE_SPEND:
          points = await this.rewardService.getRewardPointsOrDefault(RewardTypeEnum.LIKE_SPEND, 15);
          break;
        case ActivityEnum.DAILY_REWARD:
          points = await this.rewardService.getRewardPointsOrDefault(RewardTypeEnum.DAILY_LOGIN, 10);
          break;
        case ActivityEnum.SHARE_REWARD:
          points = await this.rewardService.getRewardPointsOrDefault(RewardTypeEnum.SHARE_REWARD, 500);
          break;
      }
    }

    const messages = {
      [ActivityEnum.LIKE_EARN]: `You earned ${points || generationCost || 5} YEPs for a like`,
      [ActivityEnum.LIKE_SPEND]: `You spent ${points || generationCost || 15} YEPs on a like`,
      [ActivityEnum.IMAGE_GENERATE_SPEND]: `You spent ${generationCost || this.configService.get('IMAGE_GENERATE_COST_YEPS') || 0} YEPs on image generation`,
      [ActivityEnum.VIDEO_GENERATE_SPEND]: `You spent ${generationCost || this.configService.get('VIDEO_GENERATE_COST_YEPS') || 0} YEPs on video generation`,
      [ActivityEnum.CONTEST_OPEN]: `The contest ${contest?.name} is now open! Join us for an exciting challenge and show off your skills.`,
      [ActivityEnum.CONTEST_CLOSE]: `The contest is closed. Unfortunately, you didn't win a prize this time`,
      [ActivityEnum.CONTEST_WIN]: `Congratulations! You won first place in the ${contest?.name} contest and received a reward of ${generationCost} YEPs`,
      [ActivityEnum.DAILY_REWARD]: `You received a daily login reward of ${points || generationCost || 10} YEPs`,
      [ActivityEnum.SHARE_REWARD]: `You received a reward of ${points || generationCost || 500} YEPs for invite new users`,
      [ActivityEnum.ADMIN_REPORT]: `A new report has been submitted for review`,
      [ActivityEnum.ADMIN_CONTEST_REVIEW]: `A contest review has been initiated`,
      [ActivityEnum.ADMIN_REPORT_REVIEW]: `A report review has been completed`,
      [ActivityEnum.ADMIN_CONTEST_WON]: `The contest result has been finalized and the winners have been announced`,
    };
    return messages[type];
  }

  async createActivities(
    fromUserId: number | null,
    toUserIds: number[],
    type: ActivityEnum,
    contest_reward?: number,
    isAdmin: boolean = false,
    contest?: ContestEntity,
    post?: PostEntity,
    service?: AIEnum,
    generation_cost?: number,
  ) {
    const points =
      type === ActivityEnum.IMAGE_GENERATE_SPEND ||
      type === ActivityEnum.VIDEO_GENERATE_SPEND
        ? generation_cost
        : await this.getPointsForActivity(type, contest_reward);


    const messageGenerationCost = points;
    
    const description = await this.getActivityMessage(type, messageGenerationCost, contest);
    const activities = toUserIds.map((toUserId) =>
      this.activityRepository.create({
        fromUser: fromUserId ? { id: fromUserId } : null,
        toUser: { id: toUserId },
        activityType: type,
        description,
        points,
        isAdmin,
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

  async getPointsForActivity(type: ActivityEnum, contest_reward?: number): Promise<number> {
    switch (type) {
      case ActivityEnum.LIKE_EARN:
        return await this.rewardService.getRewardPointsOrDefault(RewardTypeEnum.LIKE_EARN, 5);
      case ActivityEnum.LIKE_SPEND:
        return await this.rewardService.getRewardPointsOrDefault(RewardTypeEnum.LIKE_SPEND, 15);
      case ActivityEnum.IMAGE_GENERATE_SPEND:
        // IMAGE_GENERATE_SPEND вартість береться з ai_settings, не з rewards
        // Цей метод не використовується для IMAGE_GENERATE_SPEND, бо вартість передається через generation_cost
        return 0;
      case ActivityEnum.DAILY_REWARD:
        return await this.rewardService.getRewardPointsOrDefault(RewardTypeEnum.DAILY_LOGIN, 10);
      case ActivityEnum.SHARE_REWARD:
        return await this.rewardService.getRewardPointsOrDefault(RewardTypeEnum.SHARE_REWARD, 500);
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

  async getPopularPosts(userId: number): Promise<PopularPostsResponse> {
    try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let allFoundPosts = [];
    let period: 'today' | 'yesterday' | 'all_time' | 'mixed' = 'today';
    

    const todayQuery = `
      SELECT DISTINCT
        p.id AS id, 
        p.imageUrl AS imageUrl, 
        p.videoUrl AS videoUrl, 
        p.previewImageUrl AS previewImageUrl,
        p.createdAt AS createdAt,
        u.id AS userId,
        u.nickname AS username,
        t.id AS tagId,
        CONCAT('#', t.name) AS tagName,
        p.\`isPublished\` AS isPublished,
        p.\`isBlocked\` AS isBlocked,
        p.\`isRejected\` AS isRejected,
        (SELECT COUNT(*) FROM likes WHERE postId = p.id) AS likeCount,
        (SELECT COUNT(*) FROM viewed_posts WHERE postId = p.id) AS viewCount,
        CASE 
          WHEN EXISTS (SELECT 1 FROM likes WHERE postId = p.id AND userId = ${userId}) 
          THEN TRUE 
          ELSE FALSE 
        END AS isLiked,
        CASE 
          WHEN EXISTS (SELECT 1 FROM viewed_posts WHERE postId = p.id AND userId = ${userId}) 
          THEN TRUE 
          ELSE FALSE 
        END AS isViewed,
        p.generationParams AS generationParams
      FROM 
        posts p
        JOIN users u ON p.userId = u.id
        LEFT JOIN tags t ON p.tagId = t.id
      WHERE 
        p.createdAt >= '${today.toISOString()}' 
        AND p.createdAt < '${tomorrow.toISOString()}'
        AND p.\`isPublished\` = true 
        AND p.\`isBlocked\` = false
        AND p.\`isRejected\` = false
        AND (p.imageUrl IS NOT NULL OR p.videoUrl IS NOT NULL)
      ORDER BY 
        likeCount DESC, viewCount DESC
      LIMIT 6;
    `;

    const todayPosts = await this.postRepository.query(todayQuery);
    
    if (todayPosts.length > 0) {
      allFoundPosts.push(...todayPosts.map(post => ({
        post,
        period: 'today'
      })));
      period = 'today';
    }


    if (allFoundPosts.length < 6) {
      const yesterdayQuery = `
        SELECT DISTINCT
          p.id AS id, 
          p.imageUrl AS imageUrl, 
          p.videoUrl AS videoUrl, 
          p.previewImageUrl AS previewImageUrl,
          p.createdAt AS createdAt,
          u.id AS userId,
          u.nickname AS username,
          t.id AS tagId,
          CONCAT('#', t.name) AS tagName,
          p.isPublished AS isPublished,
          p.isBlocked AS isBlocked,
          p.isRejected AS isRejected,
          (SELECT COUNT(*) FROM likes WHERE postId = p.id) AS likeCount,
          (SELECT COUNT(*) FROM viewed_posts WHERE postId = p.id) AS viewCount,
          CASE 
            WHEN EXISTS (SELECT 1 FROM likes WHERE postId = p.id AND userId = ${userId}) 
            THEN TRUE 
            ELSE FALSE 
          END AS isLiked,
          CASE 
            WHEN EXISTS (SELECT 1 FROM viewed_posts WHERE postId = p.id AND userId = ${userId}) 
            THEN TRUE 
            ELSE FALSE 
          END AS isViewed,
          p.generationParams AS generationParams
        FROM 
          posts p
          JOIN users u ON p.userId = u.id
          LEFT JOIN tags t ON p.tagId = t.id
        WHERE 
          p.createdAt >= '${yesterday.toISOString()}' 
          AND p.createdAt < '${today.toISOString()}'
          AND p.isPublished = true 
          AND p.isBlocked = false
          AND p.isRejected = false
          AND (p.imageUrl IS NOT NULL OR p.videoUrl IS NOT NULL)
        ORDER BY 
          likeCount DESC, viewCount DESC
        LIMIT ${6 - allFoundPosts.length};
      `;

      const yesterdayPosts = await this.postRepository.query(yesterdayQuery);
      
      if (yesterdayPosts.length > 0) {
        allFoundPosts.push(...yesterdayPosts.map(post => ({
          post,
          period: 'yesterday'
        })));
        if (period === 'today') period = 'mixed';
        else period = 'yesterday';
      }
    }


    if (allFoundPosts.length < 6) {
      const allTimeQuery = `
        SELECT DISTINCT
          p.id AS id, 
          p.imageUrl AS imageUrl, 
          p.videoUrl AS videoUrl, 
          p.previewImageUrl AS previewImageUrl,
          p.createdAt AS createdAt,
          u.id AS userId,
          u.nickname AS username,
          t.id AS tagId,
          CONCAT('#', t.name) AS tagName,
          p.isPublished AS isPublished,
          p.isBlocked AS isBlocked,
          p.isRejected AS isRejected,
          (SELECT COUNT(*) FROM likes WHERE postId = p.id) AS likeCount,
          (SELECT COUNT(*) FROM viewed_posts WHERE postId = p.id) AS viewCount,
          CASE 
            WHEN EXISTS (SELECT 1 FROM likes WHERE postId = p.id AND userId = ${userId}) 
            THEN TRUE 
            ELSE FALSE 
          END AS isLiked,
          CASE 
            WHEN EXISTS (SELECT 1 FROM viewed_posts WHERE postId = p.id AND userId = ${userId}) 
            THEN TRUE 
            ELSE FALSE 
          END AS isViewed,
          p.generationParams AS generationParams
        FROM 
          posts p
          JOIN users u ON p.userId = u.id
          LEFT JOIN tags t ON p.tagId = t.id
        WHERE 
          p.isPublished = true 
          AND p.isBlocked = false
          AND p.isRejected = false
          AND (p.imageUrl IS NOT NULL OR p.videoUrl IS NOT NULL)
        ORDER BY 
          likeCount DESC, viewCount DESC
        LIMIT ${6 - allFoundPosts.length};
      `;

      const allTimePosts = await this.postRepository.query(allTimeQuery);
      
      allFoundPosts.push(...allTimePosts.map(post => ({
        post,
        period: 'all_time'
      })));
      
      if (period !== 'mixed') period = 'all_time';
    }


    allFoundPosts.sort((a, b) => {
      const aLikes = a.post.likeCount || 0;
      const bLikes = b.post.likeCount || 0;
      const aViews = a.post.viewCount || 0;
      const bViews = b.post.viewCount || 0;
      
      if (bLikes !== aLikes) {
        return bLikes - aLikes;
      }
      return bViews - aViews;
    });


    const topPosts = allFoundPosts.slice(0, 6);
    

    const formattedPosts = topPosts.map((item) => {
      return {
        id: item.post.id,
        imageUrl: item.post.imageUrl,
        videoUrl: item.post.videoUrl,
        previewImageUrl: item.post.previewImageUrl,
        likeCount: item.post.likeCount || 0,
        viewCount: item.post.viewCount || 0,
        createdAt: item.post.createdAt,
        userId: item.post.userId,
        username: item.post.username || 'Unknown User',
        tagName: item.post.tagName,
        tagId: item.post.tagId,
        isPublished: item.post.isPublished,
        isBlocked: item.post.isBlocked || false,
        isRejected: item.post.isRejected || false,
        isLiked: item.post.isLiked,
        isViewed: item.post.isViewed,
        generationParams: this.normalizeGenerationParams(item.post.generationParams) || null,
      };
    });

    return {
      posts: formattedPosts,
      period,
      totalCount: formattedPosts.length,
    };
    } catch (error) {
      console.error('Error getting popular posts:', error);
      return {
        posts: [],
        period: 'all_time',
        totalCount: 0,
      };
    }
  }

  private normalizeGenerationParams(params: any): any {
    if (!params || typeof params !== 'object' || Object.keys(params).length === 0) {
      return {
        prompt: 'Unknown',
        ai_service: 'flux',
        orientation: 'vertical',
      };
    }

    return {
      prompt: params.prompt || 'Unknown',
      ai_service: params.ai_service || 'flux',
      orientation: params.orientation || 'vertical',
      style_id: params.style_id,
      color_id: params.color_id,
      width: params.width,
      height: params.height,
      negative_prompt: params.negative_prompt,
    };
  }

  async markPostsAsViewed(postIds: number[], userId: number) {
    const posts = await this.postRepository.find({
      where: { id: In(postIds) },
    });

    const foundIds = posts.map((post) => post.id);
    const notFoundIds = postIds.filter((id) => !foundIds.includes(id));

    if (posts.length === 0) {
      return {
        message: 'No posts were marked as viewed.',
        markedCount: 0,
        notFoundIds,
      };
    }

    const existingViewedPosts = await this.viewedPostRepository.find({
      where: {
        post: { id: In(foundIds) },
        user: { id: userId },
      },
      relations: { post: true },
      select: ['post'],
    });

    const viewedPostIds = existingViewedPosts.map((vp) => vp.post.id);

    const newViewedPostIds = foundIds.filter(
      (id) => !viewedPostIds.includes(id),
    );

    if (newViewedPostIds.length === 0) {
      return {
        message: 'All existing posts have already been marked as viewed.',
        markedCount: 0,
        notFoundIds,
      };
    }

    const newViewedPosts = newViewedPostIds
      .map((id) => {
        const post = posts.find((p) => p.id === id);
        if (!post) return null;
        return this.viewedPostRepository.create({
          post,
          user: { id: userId },
        });
      })
      .filter((item) => item !== null);
    await this.viewedPostRepository.save(newViewedPosts);

    const response = {
      message:
        notFoundIds.length > 0
          ? 'Some posts were marked as viewed, but some posts were not found.'
          : 'All posts were successfully marked as viewed.',
      markedCount: newViewedPosts.length,
      notFoundIds,
    };

    return response;
  }
}
