import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PostEntity } from '../entities/post.entity';
import { ViewedPostEntity } from '../entities/viwed.entity';

@Injectable()
export class PostViewStateService {
  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectRepository(ViewedPostEntity)
    private readonly viewedPostRepository: Repository<ViewedPostEntity>,
  ) {}

  async markPostsAsViewed(postIds: number[], userId: number) {
    const uniqueIds = [...new Set(postIds)];

    const posts = await this.postRepository.find({
      select: { id: true },
      where: { id: In(uniqueIds) },
    });

    const foundIds = new Set(posts.map((post) => post.id));
    const notFoundIds = uniqueIds.filter((id) => !foundIds.has(id));

    if (foundIds.size === 0) {
      return {
        message: 'No posts were marked as viewed.',
        markedCount: 0,
        notFoundIds,
      };
    }

    // Single bulk INSERT IGNORE; the unique (userId, postId) index makes
    // already-viewed rows no-ops without a read-before-write round trip.
    const insertResult = await this.viewedPostRepository
      .createQueryBuilder()
      .insert()
      .values(
        [...foundIds].map((id) => ({
          post: { id },
          user: { id: userId },
        })),
      )
      .orIgnore()
      .updateEntity(false)
      .execute();

    const markedCount = Number(insertResult.raw?.affectedRows ?? 0);

    if (markedCount === 0) {
      return {
        message: 'All existing posts have already been marked as viewed.',
        markedCount: 0,
        notFoundIds,
      };
    }

    return {
      message:
        notFoundIds.length > 0
          ? 'Some posts were marked as viewed, but some posts were not found.'
          : 'All posts were successfully marked as viewed.',
      markedCount,
      notFoundIds,
    };
  }

  async markAllAsUnviewed(userId: number) {
    const result = await this.viewedPostRepository.delete({
      user: { id: userId },
    });

    return {
      message: 'All posts have been marked as unviewed.',
      deletedCount: result.affected,
    };
  }
}
