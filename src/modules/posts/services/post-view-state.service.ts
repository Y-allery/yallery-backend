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

    return {
      message:
        notFoundIds.length > 0
          ? 'Some posts were marked as viewed, but some posts were not found.'
          : 'All posts were successfully marked as viewed.',
      markedCount: newViewedPosts.length,
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
