import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { LikeEntity } from 'src/modules/engagement/likes/entities/like.entity';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { UserEntity } from 'src/modules/users/entities/user.entity';

@Injectable()
export class PostMetricsCollector {
  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(LikeEntity)
    private readonly likeRepository: Repository<LikeEntity>,
  ) {}

  async collect(periodStart: Date, periodEnd: Date) {
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
      this.countNewImagePosts(periodStart, periodEnd),
      this.countNewVideoPosts(periodStart, periodEnd),
      this.postRepository.count(),
      this.countTotalImagePosts(),
      this.countTotalVideoPosts(),
      this.likeRepository.count({
        where: {
          createdAt: Between(periodStart, periodEnd),
        },
      }),
      this.likeRepository.count(),
    ]);

    const activeUsers = await this.countActiveUsers(periodStart, periodEnd);
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
    const topTags7D = await this.getTopTags(periodStart, periodEnd);

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

  private countNewImagePosts(periodStart: Date, periodEnd: Date) {
    return this.postRepository
      .createQueryBuilder('p')
      .where('p.createdAt >= :start AND p.createdAt < :end', {
        start: periodStart,
        end: periodEnd,
      })
      .andWhere('p.imageUrl IS NOT NULL AND p.imageUrl != :empty', {
        empty: '',
      })
      .getCount();
  }

  private countNewVideoPosts(periodStart: Date, periodEnd: Date) {
    return this.postRepository
      .createQueryBuilder('p')
      .where('p.createdAt >= :start AND p.createdAt < :end', {
        start: periodStart,
        end: periodEnd,
      })
      .andWhere('p.videoUrl IS NOT NULL AND p.videoUrl != :empty', {
        empty: '',
      })
      .getCount();
  }

  private countTotalImagePosts() {
    return this.postRepository
      .createQueryBuilder('p')
      .where('p.imageUrl IS NOT NULL AND p.imageUrl != :empty', {
        empty: '',
      })
      .getCount();
  }

  private countTotalVideoPosts() {
    return this.postRepository
      .createQueryBuilder('p')
      .where('p.videoUrl IS NOT NULL AND p.videoUrl != :empty', {
        empty: '',
      })
      .getCount();
  }

  private async countActiveUsers(periodStart: Date, periodEnd: Date) {
    const activeUsersRaw = await this.postRepository
      .createQueryBuilder('p')
      .select('COUNT(DISTINCT p.userId)', 'cnt')
      .where('p.createdAt >= :start AND p.createdAt < :end', {
        start: periodStart,
        end: periodEnd,
      })
      .getRawOne();

    return Number(activeUsersRaw?.cnt || 0);
  }

  private async getTopTags(periodStart: Date, periodEnd: Date) {
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
