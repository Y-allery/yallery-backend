import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminMetricsEntity } from '../../entities/admin-metrics.entity';
import { MetricsSnapshotBuilder } from './metrics-snapshot.builder';

@Injectable()
export class AdminMetricsService {
  constructor(
    @InjectRepository(AdminMetricsEntity)
    private readonly adminMetricsRepository: Repository<AdminMetricsEntity>,
    private readonly metricsSnapshotBuilder: MetricsSnapshotBuilder,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async collectAdminMetricsSnapshot() {
    await this.metricsSnapshotBuilder.buildAndSave();
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
