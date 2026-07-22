import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsWhere,
  Not,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { LikeEntity } from 'src/modules/engagement/likes/entities/like.entity';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';

@Injectable()
export class PostMetricsCollector {
  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(LikeEntity)
    private readonly likeRepository: Repository<LikeEntity>,
    private readonly providerRuntimeConfigService: ProviderRuntimeConfigService,
  ) {}

  async collect(periodStart: Date, periodEnd: Date) {
    // The content bot must not inflate any product KPI. All counts below exclude
    // it; when no bot is configured the filters are a no-op.
    const botId = await this.getBotId();
    const userFilter: FindOptionsWhere<UserEntity> =
      botId != null ? { id: Not(botId) } : {};
    const postAuthorFilter: FindOptionsWhere<PostEntity> =
      botId != null ? { user: { id: Not(botId) } } : {};
    const likeAuthorFilter: FindOptionsWhere<LikeEntity> =
      botId != null ? { user: { id: Not(botId) } } : {};

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
          ...userFilter,
        },
      }),
      this.userRepository.count({ where: userFilter }),
      this.postRepository.count({
        where: {
          createdAt: Between(periodStart, periodEnd),
          ...postAuthorFilter,
        },
      }),
      this.countNewImagePosts(periodStart, periodEnd, botId),
      this.countNewVideoPosts(periodStart, periodEnd, botId),
      this.postRepository.count({ where: postAuthorFilter }),
      this.countTotalImagePosts(botId),
      this.countTotalVideoPosts(botId),
      this.likeRepository.count({
        where: {
          createdAt: Between(periodStart, periodEnd),
          ...likeAuthorFilter,
        },
      }),
      this.likeRepository.count({ where: likeAuthorFilter }),
    ]);

    const activeUsers = await this.countActiveUsers(
      periodStart,
      periodEnd,
      botId,
    );
    const newContestPosts = await this.postRepository.count({
      where: {
        createdAt: Between(periodStart, periodEnd),
        contest: { id: Between(1, Number.MAX_SAFE_INTEGER) } as any,
        ...postAuthorFilter,
      } as any,
    });
    const newRegularPosts = newPosts - newContestPosts;
    const avgLikesPerPost =
      newPosts > 0 ? Number((newLikes / newPosts).toFixed(2)) : 0;
    const postsPerUserAvg7D =
      activeUsers > 0 ? Number((newPosts / activeUsers).toFixed(2)) : 0;
    const topTags7D = await this.getTopTags(periodStart, periodEnd, botId);

    return {
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
      postsPerUserAvg7D,
      topTags7D,
    };
  }

  private async getBotId(): Promise<number | null> {
    const raw = await this.providerRuntimeConfigService.getNumber(
      'CONTENT_BOT_USER_ID',
    );
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  }

  private excludeBot<T>(
    qb: SelectQueryBuilder<T>,
    botId: number | null,
    alias = 'p',
  ): SelectQueryBuilder<T> {
    if (botId != null) {
      qb.andWhere(`${alias}.userId != :botId`, { botId });
    }
    return qb;
  }

  private countNewImagePosts(
    periodStart: Date,
    periodEnd: Date,
    botId: number | null,
  ) {
    return this.excludeBot(
      this.postRepository
        .createQueryBuilder('p')
        .where('p.createdAt >= :start AND p.createdAt < :end', {
          start: periodStart,
          end: periodEnd,
        })
        .andWhere('p.imageUrl IS NOT NULL AND p.imageUrl != :empty', {
          empty: '',
        }),
      botId,
    ).getCount();
  }

  private countNewVideoPosts(
    periodStart: Date,
    periodEnd: Date,
    botId: number | null,
  ) {
    return this.excludeBot(
      this.postRepository
        .createQueryBuilder('p')
        .where('p.createdAt >= :start AND p.createdAt < :end', {
          start: periodStart,
          end: periodEnd,
        })
        .andWhere('p.videoUrl IS NOT NULL AND p.videoUrl != :empty', {
          empty: '',
        }),
      botId,
    ).getCount();
  }

  private countTotalImagePosts(botId: number | null) {
    return this.excludeBot(
      this.postRepository
        .createQueryBuilder('p')
        .where('p.imageUrl IS NOT NULL AND p.imageUrl != :empty', {
          empty: '',
        }),
      botId,
    ).getCount();
  }

  private countTotalVideoPosts(botId: number | null) {
    return this.excludeBot(
      this.postRepository
        .createQueryBuilder('p')
        .where('p.videoUrl IS NOT NULL AND p.videoUrl != :empty', {
          empty: '',
        }),
      botId,
    ).getCount();
  }

  private async countActiveUsers(
    periodStart: Date,
    periodEnd: Date,
    botId: number | null,
  ) {
    const activeUsersRaw = await this.excludeBot(
      this.postRepository
        .createQueryBuilder('p')
        .select('COUNT(DISTINCT p.userId)', 'cnt')
        .where('p.createdAt >= :start AND p.createdAt < :end', {
          start: periodStart,
          end: periodEnd,
        }),
      botId,
    ).getRawOne();

    return Number(activeUsersRaw?.cnt || 0);
  }

  private async getTopTags(
    periodStart: Date,
    periodEnd: Date,
    botId: number | null,
  ) {
    const rawTopTags = await this.excludeBot(
      this.postRepository
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
        .andWhere('t.id IS NOT NULL'),
      botId,
    )
      .groupBy('t.id')
      .addGroupBy('t.name')
      .orderBy('COUNT(DISTINCT p.id)', 'DESC')
      .addOrderBy('COUNT(DISTINCT l.id)', 'DESC')
      .limit(10)
      .getRawMany();

    return (
      rawTopTags?.map((row) => ({
        tagId: Number(row.tagId),
        name: row.name,
        posts: Number(row.posts),
        likes: Number(row.likes),
      })) || []
    );
  }
}
