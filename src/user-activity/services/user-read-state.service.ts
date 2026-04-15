import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ContestTypeEnum } from 'src/contest/types/contest.status.enum';
import { PostEntity } from 'src/post/entities/post.entity';
import { ViewedPostEntity } from 'src/post/entities/viwed.entity';
import { MarkUserReadStateDto } from '../dto/mark-user-read-state.dto';
import { UserActivityQueryService } from './user-activity-query.service';
import { USER_READ_STATE_KINDS } from '../types/user-read-state.constants';

@Injectable()
export class UserReadStateService {
  constructor(
    private readonly userActivityQueryService: UserActivityQueryService,
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectRepository(ViewedPostEntity)
    private readonly viewedPostRepository: Repository<ViewedPostEntity>,
  ) {}

  async markReadState(userId: number, dto: MarkUserReadStateDto) {
    switch (dto.kind) {
      case USER_READ_STATE_KINDS.FEED: {
        const markedCount = await this.userActivityQueryService.markFeedAsRead(
          userId,
        );
        return {
          status: 'success',
          kind: dto.kind,
          message: 'Activity feed marked as read',
          markedCount,
        };
      }

      case USER_READ_STATE_KINDS.REGULAR_CONTESTS: {
        const markedCount =
          await this.userActivityQueryService.markContestActivitiesAsReadByType(
            userId,
            ContestTypeEnum.DEFAULT,
          );

        return {
          status: 'success',
          kind: dto.kind,
          message: 'Regular contests marked as read',
          markedCount,
        };
      }

      case USER_READ_STATE_KINDS.FINE_TUNE_CONTESTS: {
        const markedCount =
          await this.userActivityQueryService.markContestActivitiesAsReadByType(
            userId,
            ContestTypeEnum.FINE_TUNE,
          );

        return {
          status: 'success',
          kind: dto.kind,
          message: 'Fine-tune contests marked as read',
          markedCount,
        };
      }

      case USER_READ_STATE_KINDS.STORIES: {
        const result = await this.markStoriesAsViewed(
          userId,
          dto.post_ids ?? [],
        );

        return {
          status: 'success',
          kind: dto.kind,
          message: 'Stories marked as read',
          ...result,
        };
      }
    }
  }

  private async markStoriesAsViewed(userId: number, postIds: number[]) {
    const posts = await this.postRepository.find({
      where: { id: In(postIds) },
    });

    const foundIds = posts.map((post) => post.id);
    const notFoundIds = postIds.filter((id) => !foundIds.includes(id));

    if (!posts.length) {
      return {
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

    const viewedPostIds = existingViewedPosts.map((item) => item.post.id);
    const newViewedPostIds = foundIds.filter(
      (id) => !viewedPostIds.includes(id),
    );

    if (!newViewedPostIds.length) {
      return {
        markedCount: 0,
        notFoundIds,
      };
    }

    const newViewedPosts = newViewedPostIds
      .map((id) => {
        const post = posts.find((item) => item.id === id);
        if (!post) {
          return null;
        }

        return this.viewedPostRepository.create({
          post,
          user: { id: userId },
        });
      })
      .filter((item): item is ViewedPostEntity => item !== null);

    await this.viewedPostRepository.save(newViewedPosts);

    return {
      markedCount: newViewedPosts.length,
      notFoundIds,
    };
  }
}
