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

    // Передаємо points як generationCost для правильного відображення в повідомленні
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

  async claimDailyReward(userId: number): Promise<{ success: boolean; message: string; pointsAwarded: number }> {
    // Перевіряємо, чи користувач вже отримав нагороду сьогодні
    const hasReceivedToday = await this.hasReceivedDailyRewardToday(userId);
    
    if (hasReceivedToday) {
      return {
        success: false,
        message: 'You have already received your daily reward today. Come back tomorrow!',
        pointsAwarded: 0
      };
    }
    const dailyRewardAmount = this.configService.get('DAILY_REWARD_YEPS');

    // Отримуємо кількість YEPs за щоденну нагороду
    const dailyRewardPoints = this.getPointsForActivity(ActivityEnum.DAILY_REWARD);
    
    // Створюємо активність щоденної нагороди
    await this.createActivities(
      null, // fromUserId - null для системних активностей
      [userId], // toUserIds
      ActivityEnum.DAILY_REWARD
    );

    await this.userRepository.increment({ id: userId }, 'points', dailyRewardAmount);
    // Оновлюємо профіль користувача через WebSocket
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
    
    // Спочатку шукаємо пости за сьогодні
    let todayPosts = await this.postRepository
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.user', 'user')
      .leftJoinAndSelect('post.tag', 'tag')
      .leftJoinAndSelect('post.likes', 'likes')
      .leftJoinAndSelect('likes.user', 'likesUser')
      .leftJoin('post.viewedBy', 'viewedBy')
      .where('post.createdAt >= :today', { today })
      .andWhere('post.createdAt < :tomorrow', { tomorrow })
      .andWhere('post.is_published = :isPublished', { isPublished: true })
      .andWhere('post.is_blocked = :isBlocked', { isBlocked: false })
      .andWhere('post.is_rejected = :isRejected', { isRejected: false })
      .andWhere('(post.imageUrl IS NOT NULL OR post.videoUrl IS NOT NULL)')
      .addSelect('COUNT(DISTINCT likes.id)', 'likeCount')
      .addSelect('COUNT(DISTINCT viewedBy.id)', 'viewCount')
      .groupBy('post.id, user.id, user.name, user.nickname, user.email, tag.id, tag.name, post.imageUrl, post.videoUrl, post.createdAt, post.is_published, post.is_blocked, post.is_rejected')
      .orderBy('COUNT(DISTINCT likes.id)', 'DESC')
      .addOrderBy('COUNT(DISTINCT viewedBy.id)', 'DESC')
      .limit(3)
      .getRawAndEntities();

    if (todayPosts.entities.length > 0) {
      allFoundPosts.push(...todayPosts.entities.map((post, index) => ({
        post,
        rawData: todayPosts.raw[index],
        period: 'today',
        isLiked: post.likes?.some(like => like.user?.id === userId) || false
      })));
      period = 'today';
    }

    // Якщо за сьогодні немає постів або їх менше 3, шукаємо за вчора
    if (allFoundPosts.length < 3) {
      const yesterdayPosts = await this.postRepository
        .createQueryBuilder('post')
        .leftJoinAndSelect('post.user', 'user')
        .leftJoinAndSelect('post.tag', 'tag')
        .leftJoinAndSelect('post.likes', 'likes')
        .leftJoinAndSelect('likes.user', 'likesUser')
        .leftJoin('post.viewedBy', 'viewedBy')
        .where('post.createdAt >= :yesterday', { yesterday })
        .andWhere('post.createdAt < :today', { today })
        .andWhere('post.is_published = :isPublished', { isPublished: true })
        .andWhere('post.is_blocked = :isBlocked', { isBlocked: false })
        .andWhere('post.is_rejected = :isRejected', { isRejected: false })
        .andWhere('(post.imageUrl IS NOT NULL OR post.videoUrl IS NOT NULL)')
        .addSelect('COUNT(DISTINCT likes.id)', 'likeCount')
        .addSelect('COUNT(DISTINCT viewedBy.id)', 'viewCount')
        .groupBy('post.id, user.id, user.name, user.nickname, user.email, tag.id, tag.name, post.imageUrl, post.videoUrl, post.createdAt, post.is_published, post.is_blocked, post.is_rejected')
        .orderBy('COUNT(DISTINCT likes.id)', 'DESC')
        .addOrderBy('COUNT(DISTINCT viewedBy.id)', 'DESC')
        .limit(3 - allFoundPosts.length)
        .getRawAndEntities();

      if (yesterdayPosts.entities.length > 0) {
        allFoundPosts.push(...yesterdayPosts.entities.map((post, index) => ({
          post,
          rawData: yesterdayPosts.raw[index],
          period: 'yesterday',
          isLiked: post.likes?.some(like => like.user?.id === userId) || false
        })));
        if (period === 'today') period = 'mixed';
        else period = 'yesterday';
      }
    }

    // Якщо все ще немає 3 постів, шукаємо за всі часи
    if (allFoundPosts.length < 3) {
      const allPosts = await this.postRepository.find({
        where: {
          is_published: true,
          is_blocked: false,
          is_rejected: false,
        },
        relations: ['user', 'tag', 'likes', 'likes.user', 'viewedBy'],
      });
      
      const postsWithMedia = allPosts.filter(post => post.imageUrl || post.videoUrl);
      
      const sortedPosts = postsWithMedia
        .map(post => {
          const isLiked = post.likes?.some(like => like.user?.id === userId) || false;
          console.log(`🔍 Post ${post.id}:`, {
            likesCount: post.likes?.length || 0,
            likes: post.likes?.map(like => ({ likeId: like.id, userId: like.user?.id, currentUserId: userId })),
            isLiked,
            hasLikes: !!post.likes,
            hasLikesUser: post.likes?.every(like => !!like.user)
          });
          
          return {
            post,
            likeCount: post.likes?.length || 0,
            viewCount: post.viewedBy?.length || 0,
            isLiked,
            period: 'all_time'
          };
        })
        .sort((a, b) => {
          if (b.likeCount !== a.likeCount) {
            return b.likeCount - a.likeCount;
          }
          return b.viewCount - a.viewCount;
        })
        .slice(0, 3 - allFoundPosts.length);

      allFoundPosts.push(...sortedPosts.map(item => ({
        post: item.post,
        rawData: { likeCount: item.likeCount.toString(), viewCount: item.viewCount.toString() },
        period: item.period,
        isLiked: item.isLiked
      })));
      
      if (period !== 'mixed') period = 'all_time';
    }

    // Сортуємо всі знайдені пости за популярністю
    allFoundPosts.sort((a, b) => {
      const aLikes = parseInt(a.rawData.likeCount) || 0;
      const bLikes = parseInt(b.rawData.likeCount) || 0;
      const aViews = parseInt(a.rawData.viewCount) || 0;
      const bViews = parseInt(b.rawData.viewCount) || 0;
      
      if (bLikes !== aLikes) {
        return bLikes - aLikes;
      }
      return bViews - aViews;
    });

    // Беремо топ 3 пости
    const topPosts = allFoundPosts.slice(0, 3);
    
    // Форматуємо результат
    const formattedPosts = topPosts.map(async (item) => {
      // isLiked вже обчислено для всіх випадків
      const isLiked = item.isLiked || false;
      
      return {
        id: item.post.id,
        imageUrl: item.post.imageUrl,
        videoUrl: item.post.videoUrl,
        likeCount: parseInt(item.rawData.likeCount) || 0,
        viewCount: parseInt(item.rawData.viewCount) || 0,
        createdAt: item.post.createdAt,
        userId: item.post.user.id,
        username: item.post.user.nickname || item.post.user.name || item.post.user.email || 'Unknown User',
        tagName: item.post.tag?.name || null,
        tagId: item.post.tag?.id || null,
        isPublished: item.post.is_published,
        isBlocked: item.post.is_blocked,
        isRejected: item.post.is_rejected,
        isLiked,
      };
    });

    const resolvedPosts = await Promise.all(formattedPosts);

    return {
      posts: resolvedPosts,
      period,
      totalCount: resolvedPosts.length,
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
}
