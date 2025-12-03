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
  ) {}

  getActivityMessage(
    type: ActivityEnum,
    generationCost?: number,
    contest?: ContestEntity,
  ): string {
    const messages = {
      [ActivityEnum.LIKE_EARN]: `You earned ${generationCost || this.configService.get('LIKE_EARN_YEPS')} YEPs for a like`,
      [ActivityEnum.LIKE_SPEND]: `You spent ${generationCost || this.configService.get('LIKE_SPEND_YEPS')} YEPs on a like`,
      [ActivityEnum.IMAGE_GENERATE_SPEND]: `You spent ${generationCost || this.configService.get('IMAGE_GENERATE_COST_YEPS')} YEPs on image generation`,
      [ActivityEnum.VIDEO_GENERATE_SPEND]: `You spent ${generationCost || this.configService.get('VIDEO_GENERATE_COST_YEPS')} YEPs on video generation`,
      [ActivityEnum.CONTEST_OPEN]: `The contest ${contest?.name} is now open! Join us for an exciting challenge and show off your skills.`,
      [ActivityEnum.CONTEST_CLOSE]: `The contest is closed. Unfortunately, you didn't win a prize this time`,
      [ActivityEnum.CONTEST_WIN]: `Congratulations! You won first place in the ${contest?.name} contest and received a reward of ${generationCost} YEPs`,
      [ActivityEnum.DAILY_REWARD]: `You received a daily reward of ${generationCost || this.configService.get('DAILY_REWARD_YEPS')} YEPs`,
      [ActivityEnum.SHARE_REWARD]: `You received a reward of ${generationCost || this.configService.get('SHARE_REWARD_YEPS')} YEPs for invite new users`,
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


    const messageGenerationCost = points;
    
    const description = this.getActivityMessage(type, messageGenerationCost, contest);
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
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
    const todayEnd = new Date(new Date().setHours(23, 59, 59, 999));

    const dailyRewardActivity = await this.activityRepository.findOne({
      where: {
        toUser: { id: userId },
        activityType: ActivityEnum.DAILY_REWARD,
        createdAt: Between(todayStart, todayEnd),
      },
    });

    const hasReceived = !!dailyRewardActivity;

    return hasReceived;
  }

  async claimDailyReward(userId: number): Promise<{ success: boolean; message: string; pointsAwarded: number }> {

    const hasReceivedToday = await this.hasReceivedDailyRewardToday(userId);
    
    if (hasReceivedToday) {
      return {
        success: false,
        message: 'You have already received your daily reward today. Come back tomorrow!',
        pointsAwarded: 0
      };
    }
    const dailyRewardAmount = this.configService.get('DAILY_REWARD_YEPS');


    const dailyRewardPoints = this.getPointsForActivity(ActivityEnum.DAILY_REWARD);
    

    await this.createActivities(
      null,
      [userId], // toUserIds
      ActivityEnum.DAILY_REWARD
    );

    await this.userRepository.increment({ id: userId }, 'points', dailyRewardAmount);

    await this.notificationGateway.emitProfileUpdate(userId.toString());

    return {
      success: true,
      message: `Successfully claimed daily reward of ${dailyRewardPoints} YEPs!`,
      pointsAwarded: dailyRewardPoints
    };
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
    
    // Helper function to build optimized query with JOINs
    const buildPopularPostsQuery = (
      startDate: Date | null,
      endDate: Date | null,
      limit: number,
    ) => {
      const qb = this.postRepository
        .createQueryBuilder('p')
        .innerJoin('p.user', 'u')
        .leftJoin('p.tag', 't')
        .leftJoin('p.likes', 'l')
        .leftJoin('p.viewedBy', 'v')
        .leftJoin('likes', 'user_like', 'user_like.postId = p.id AND user_like.userId = :userId', { userId })
        .leftJoin('viewed_posts', 'user_viewed', 'user_viewed.postId = p.id AND user_viewed.userId = :userId', { userId })
        .select('p.id', 'id')
        .addSelect('p.imageUrl', 'image_url')
        .addSelect('p.videoUrl', 'video_url')
        .addSelect('p.createdAt', 'created_at')
        .addSelect('u.id', 'user_id')
        .addSelect('u.nickname', 'username')
        .addSelect('t.id', 'tag_id')
        .addSelect('t.name', 'tag_name')
        .addSelect('p.is_published', 'is_published')
        .addSelect('p.is_blocked', 'is_blocked')
        .addSelect('p.is_rejected', 'is_rejected')
        .addSelect('COUNT(DISTINCT l.id)', 'like_count')
        .addSelect('COUNT(DISTINCT v.id)', 'view_count')
        .addSelect('MAX(CASE WHEN user_like.id IS NOT NULL THEN 1 ELSE 0 END)', 'is_liked')
        .addSelect('MAX(CASE WHEN user_viewed.id IS NOT NULL THEN 1 ELSE 0 END)', 'is_viewed')
        .addSelect('p.generation_params', 'generation_params')
        .where('p.is_published = :isPublished', { isPublished: true })
        .andWhere('p.is_blocked = :isBlocked', { isBlocked: false })
        .andWhere('p.is_rejected = :isRejected', { isRejected: false })
        .andWhere('(p.imageUrl IS NOT NULL AND p.imageUrl != :empty) OR (p.videoUrl IS NOT NULL AND p.videoUrl != :empty)', { empty: '' })
        .groupBy('p.id')
        .addGroupBy('u.id')
        .addGroupBy('u.nickname')
        .addGroupBy('t.id')
        .addGroupBy('t.name')
        .addGroupBy('p.imageUrl')
        .addGroupBy('p.videoUrl')
        .addGroupBy('p.createdAt')
        .addGroupBy('p.is_published')
        .addGroupBy('p.is_blocked')
        .addGroupBy('p.is_rejected')
        .addGroupBy('p.generation_params')
        .orderBy('like_count', 'DESC')
        .addOrderBy('view_count', 'DESC')
        .limit(limit)
        .setParameter('userId', userId);

      if (startDate) {
        qb.andWhere('p.createdAt >= :startDate', { startDate });
      }
      if (endDate) {
        qb.andWhere('p.createdAt < :endDate', { endDate });
      }

      return qb;
    };

    // Today posts
    const todayPosts = await buildPopularPostsQuery(today, tomorrow, 6).getRawMany();
    
    if (todayPosts.length > 0) {
      allFoundPosts.push(...todayPosts.map(post => ({
        post: {
          ...post,
          like_count: Number(post.like_count ?? 0),
          view_count: Number(post.view_count ?? 0),
          is_liked: Boolean(post.is_liked),
          is_viewed: Boolean(post.is_viewed),
        },
        period: 'today'
      })));
      period = 'today';
    }

    // Yesterday posts (if needed)
    if (allFoundPosts.length < 6) {
      const yesterdayPosts = await buildPopularPostsQuery(yesterday, today, 6 - allFoundPosts.length).getRawMany();
      
      if (yesterdayPosts.length > 0) {
        allFoundPosts.push(...yesterdayPosts.map(post => ({
          post: {
            ...post,
            like_count: Number(post.like_count ?? 0),
            view_count: Number(post.view_count ?? 0),
            is_liked: Boolean(post.is_liked),
            is_viewed: Boolean(post.is_viewed),
          },
          period: 'yesterday'
        })));
        if (period === 'today') period = 'mixed';
        else period = 'yesterday';
      }
    }

    // All time posts (if needed)
    if (allFoundPosts.length < 6) {
      const allTimePosts = await buildPopularPostsQuery(null, null, 6 - allFoundPosts.length).getRawMany();
      
      allFoundPosts.push(...allTimePosts.map(post => ({
        post: {
          ...post,
          like_count: Number(post.like_count ?? 0),
          view_count: Number(post.view_count ?? 0),
          is_liked: Boolean(post.is_liked),
          is_viewed: Boolean(post.is_viewed),
        },
        period: 'all_time'
      })));
      
      if (period !== 'mixed') period = 'all_time';
    }


    allFoundPosts.sort((a, b) => {
      const aLikes = parseInt(a.post.like_count) || 0;
      const bLikes = parseInt(b.post.like_count) || 0;
      const aViews = parseInt(a.post.view_count) || 0;
      const bViews = parseInt(b.post.view_count) || 0;
      
      if (bLikes !== aLikes) {
        return bLikes - aLikes;
      }
      return bViews - aViews;
    });


    const topPosts = allFoundPosts.slice(0, 6);
    

    const formattedPosts = topPosts.map((item) => {
      return {
        id: item.post.id,
        imageUrl: item.post.image_url,
        videoUrl: item.post.video_url,
        likeCount: parseInt(item.post.like_count) || 0,
        viewCount: parseInt(item.post.view_count) || 0,
        createdAt: new Date(item.post.created_at),
        userId: item.post.user_id,
        username: item.post.username || 'Unknown User',
        tagName: item.post.tag_name ? `#${item.post.tag_name}` : null,
        tagId: item.post.tag_id,
        isPublished: item.post.is_published,
        isBlocked: item.post.is_blocked,
        isRejected: item.post.is_rejected,
        isLiked: item.post.is_liked,
        isViewed: item.post.is_viewed,
        generation_params: this.normalizeGenerationParams(item.post.generation_params),
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
