import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { AdminMetricsEntity } from '../entities/admin-metrics.entity';
import { AISettingsEntity } from 'src/media-generation/entities/legacy-ai-settings.entity';
import { ContestEntity } from 'src/contest/entity/contest.entity';
import { LikeEntity } from 'src/like/entities/like.entity';
import { PaymentEntity } from 'src/payment/entities/payment.entity';
import { PostEntity } from 'src/post/entities/post.entity';
import { RewardService } from 'src/reward/reward.service';
import { RewardTypeEnum } from 'src/reward/types/reward-type.enum';
import { UserEntity } from 'src/user/entities/user.entity';

@Injectable()
export class AdminMetricsService {
  private readonly logger = new Logger(AdminMetricsService.name);

  constructor(
    private readonly rewardService: RewardService,
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(AISettingsEntity)
    private readonly aiSettingsRepository: Repository<AISettingsEntity>,
    @InjectRepository(AdminMetricsEntity)
    private readonly adminMetricsRepository: Repository<AdminMetricsEntity>,
    @InjectRepository(LikeEntity)
    private readonly likeRepository: Repository<LikeEntity>,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
    @InjectRepository(ContestEntity)
    private readonly contestRepository: Repository<ContestEntity>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async collectAdminMetricsSnapshot() {
    const now = new Date();
    const periodEnd = new Date(now.getTime());
    const periodStart = new Date(
      periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000,
    );

    const [
      newUsers,
      totalUsers,
      newPosts,
      newImagePosts,
      newVideoPosts,
      totalPosts,
      totalImagePosts,
      totalVideoPosts,
      newLikes,
      totalLikes,
    ] = await Promise.all([
      this.userRepository.count({
        where: {
          createdAt: Between(periodStart, periodEnd),
        },
      }),
      this.userRepository.count(),
      this.postRepository.count({
        where: {
          createdAt: Between(periodStart, periodEnd),
        },
      }),
      this.postRepository
        .createQueryBuilder('p')
        .where('p.createdAt >= :start AND p.createdAt < :end', {
          start: periodStart,
          end: periodEnd,
        })
        .andWhere('p.imageUrl IS NOT NULL AND p.imageUrl != :empty', {
          empty: '',
        })
        .getCount(),
      this.postRepository
        .createQueryBuilder('p')
        .where('p.createdAt >= :start AND p.createdAt < :end', {
          start: periodStart,
          end: periodEnd,
        })
        .andWhere('p.videoUrl IS NOT NULL AND p.videoUrl != :empty', {
          empty: '',
        })
        .getCount(),
      this.postRepository.count(),
      this.postRepository
        .createQueryBuilder('p')
        .where('p.imageUrl IS NOT NULL AND p.imageUrl != :empty', {
          empty: '',
        })
        .getCount(),
      this.postRepository
        .createQueryBuilder('p')
        .where('p.videoUrl IS NOT NULL AND p.videoUrl != :empty', {
          empty: '',
        })
        .getCount(),
      this.likeRepository.count({
        where: {
          createdAt: Between(periodStart, periodEnd),
        },
      }),
      this.likeRepository.count(),
    ]);

    const activeUsersRaw = await this.postRepository
      .createQueryBuilder('p')
      .select('COUNT(DISTINCT p.userId)', 'cnt')
      .where('p.createdAt >= :start AND p.createdAt < :end', {
        start: periodStart,
        end: periodEnd,
      })
      .getRawOne();

    const activeUsers = Number(activeUsersRaw?.cnt || 0);
    const newContestPosts = await this.postRepository.count({
      where: {
        createdAt: Between(periodStart, periodEnd),
        contest: { id: Between(1, Number.MAX_SAFE_INTEGER) } as any,
      } as any,
    });
    const newRegularPosts = newPosts - newContestPosts;
    const avgLikesPerPost =
      newPosts > 0 ? Number((newLikes / newPosts).toFixed(2)) : 0;
    const postsPerUserAvg7D =
      activeUsers > 0 ? Number((newPosts / activeUsers).toFixed(2)) : 0;

    const rawTopTags = await this.postRepository
      .createQueryBuilder('p')
      .leftJoin('p.tag', 't')
      .leftJoin('p.likes', 'l')
      .select('t.id', 'tagId')
      .addSelect('t.name', 'name')
      .addSelect('COUNT(DISTINCT p.id)', 'posts')
      .addSelect('COUNT(DISTINCT l.id)', 'likes')
      .where('p.createdAt >= :start AND p.createdAt < :end', {
        start: periodStart,
        end: periodEnd,
      })
      .andWhere('t.id IS NOT NULL')
      .groupBy('t.id')
      .addGroupBy('t.name')
      .orderBy('COUNT(DISTINCT p.id)', 'DESC')
      .addOrderBy('COUNT(DISTINCT l.id)', 'DESC')
      .limit(10)
      .getRawMany();

    const topTags7D =
      rawTopTags?.map((row) => ({
        tagId: Number(row.tagId),
        name: row.name,
        posts: Number(row.posts),
        likes: Number(row.likes),
      })) || [];

    const imageAiServices = await this.aiSettingsRepository.find({
      where: { type: 'image', isActive: true },
      select: ['aiService'],
    });
    const videoAiServices = await this.aiSettingsRepository.find({
      where: { type: 'video', isActive: true },
      select: ['aiService'],
    });

    const validImageServices = new Set(
      imageAiServices.map((s) => s.aiService),
    );
    const validVideoServices = new Set(
      videoAiServices.map((s) => s.aiService),
    );

    const rawImageAi = await this.postRepository
      .createQueryBuilder('p')
      .select(
        "JSON_UNQUOTE(JSON_EXTRACT(p.generationParams, '$.aiService'))",
        'ai_service',
      )
      .addSelect('COUNT(*)', 'count')
      .where('p.createdAt >= :start AND p.createdAt < :end', {
        start: periodStart,
        end: periodEnd,
      })
      .andWhere('p.imageUrl IS NOT NULL AND p.imageUrl != :empty', {
        empty: '',
      })
      .groupBy('ai_service')
      .getRawMany();

    const rawVideoAi = await this.postRepository
      .createQueryBuilder('p')
      .select(
        "JSON_UNQUOTE(JSON_EXTRACT(p.generationParams, '$.aiService'))",
        'ai_service',
      )
      .addSelect('COUNT(*)', 'count')
      .where('p.createdAt >= :start AND p.createdAt < :end', {
        start: periodStart,
        end: periodEnd,
      })
      .andWhere('p.videoUrl IS NOT NULL AND p.videoUrl != :empty', {
        empty: '',
      })
      .groupBy('ai_service')
      .getRawMany();

    const imageStats: Record<string, { newPosts: number; totalPosts: number }> =
      {};
    const videoStats: Record<string, { newPosts: number; totalPosts: number }> =
      {};

    for (const row of rawImageAi) {
      let key = row.ai_service || 'flux';
      if (!validImageServices.has(key)) {
        key = 'flux';
      }
      const count = Number(row.count || 0);
      if (imageStats[key]) {
        imageStats[key].newPosts += count;
      } else {
        imageStats[key] = {
          newPosts: count,
          totalPosts: 0,
        };
      }
    }

    for (const row of rawVideoAi) {
      let key = row.ai_service || 'byty_dance';
      if (!validVideoServices.has(key)) {
        key = 'byty_dance';
      }
      const count = Number(row.count || 0);
      if (videoStats[key]) {
        videoStats[key].newPosts += count;
      } else {
        videoStats[key] = {
          newPosts: count,
          totalPosts: 0,
        };
      }
    }

    const payments7D = await this.paymentRepository.find({
      where: {
        createdAt: Between(periodStart, periodEnd),
        status: 'completed',
      },
    });

    const productRewardMap: { [key: string]: RewardTypeEnum } = {
      '5000yeps': RewardTypeEnum.PAYMENT_5000,
      '15000yeps': RewardTypeEnum.PAYMENT_15000,
      '30000yeps': RewardTypeEnum.PAYMENT_30000,
    };

    const paymentFallbackValues: { [key: string]: number } = {
      [RewardTypeEnum.PAYMENT_5000]: 5000,
      [RewardTypeEnum.PAYMENT_15000]: 15000,
      [RewardTypeEnum.PAYMENT_30000]: 30000,
    };

    let purchasedYeps7D = 0;
    for (const payment of payments7D) {
      const rewardType = productRewardMap[payment.productId];
      if (rewardType) {
        try {
          const points = await this.rewardService.getRewardPoints(rewardType);
          purchasedYeps7D += points;
        } catch (error) {
          const fallbackValue = paymentFallbackValues[rewardType];
          if (fallbackValue) {
            purchasedYeps7D += fallbackValue;
          } else {
            this.logger.warn(
              `Failed to get reward points for ${rewardType}:`,
              error,
            );
          }
        }
      }
    }

    const contestParticipantsStatsRaw = await this.contestRepository
      .createQueryBuilder('c')
      .leftJoin('c.participants', 'p')
      .select('c.id', 'contestId')
      .addSelect('c.name', 'contestName')
      .addSelect('COUNT(DISTINCT p.id)', 'participantsCount')
      .where(
        '(c.startTime >= :start OR c.endTime >= :start OR c.startTime <= :end)',
        {
          start: periodStart,
          end: periodEnd,
        },
      )
      .groupBy('c.id')
      .addGroupBy('c.name')
      .having('COUNT(DISTINCT p.id) > 0')
      .orderBy('COUNT(DISTINCT p.id)', 'DESC')
      .getRawMany();

    const contestParticipantsStats = contestParticipantsStatsRaw.map((row) => ({
      contestId: Number(row.contestId),
      contestName: row.contestName,
      participantsCount: Number(row.participantsCount || 0),
    }));

    const snapshot = this.adminMetricsRepository.create({
      periodStart,
      periodEnd,
      newUsers,
      totalUsers,
      newPosts,
      newImagePosts,
      newVideoPosts,
      totalPosts,
      totalImagePosts,
      totalVideoPosts,
      activeUsers,
      newLikes,
      totalLikes,
      newContestPosts,
      newRegularPosts,
      avgLikesPerPost,
      aiStats: {
        image: imageStats,
        video: videoStats,
      },
      postsPerUserAvg7D,
      topTags7D,
      purchasedYeps7D,
      contestParticipantsStats,
    });

    await this.adminMetricsRepository.save(snapshot);
  }

  async getAdminMetricsOverview() {
    const latest = await this.adminMetricsRepository
      .createQueryBuilder('m')
      .orderBy('m.snapshotTime', 'DESC')
      .limit(1)
      .getOne();

    if (!latest) {
      return {
        from: null,
        to: null,
        newUsers: 0,
        totalUsers: 0,
        newPosts: 0,
        newImagePosts: 0,
        newVideoPosts: 0,
        totalPosts: 0,
        totalImagePosts: 0,
        totalVideoPosts: 0,
        activeUsers: 0,
        newLikes: 0,
        totalLikes: 0,
        newContestPosts: 0,
        newRegularPosts: 0,
        avgLikesPerPost: 0,
        aiStats: null,
        postsPerUserAvg7D: 0,
        topTags7D: null,
        purchasedYeps7D: 0,
        contestParticipantsStats: null,
      };
    }

    return {
      from: latest.periodStart,
      to: latest.periodEnd,
      newUsers: latest.newUsers,
      totalUsers: latest.totalUsers,
      newPosts: latest.newPosts,
      newImagePosts: latest.newImagePosts,
      newVideoPosts: latest.newVideoPosts,
      totalPosts: latest.totalPosts,
      totalImagePosts: latest.totalImagePosts,
      totalVideoPosts: latest.totalVideoPosts,
      activeUsers: latest.activeUsers,
      newLikes: latest.newLikes,
      totalLikes: latest.totalLikes,
      newContestPosts: latest.newContestPosts,
      newRegularPosts: latest.newRegularPosts,
      avgLikesPerPost: latest.avgLikesPerPost,
      aiStats: latest.aiStats,
      postsPerUserAvg7D: latest.postsPerUserAvg7D,
      topTags7D: latest.topTags7D,
      purchasedYeps7D: latest.purchasedYeps7D,
      contestParticipantsStats: latest.contestParticipantsStats,
    };
  }
}
