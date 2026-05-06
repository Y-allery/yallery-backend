import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ContestTypeEnum } from 'src/modules/contests/types/contest.status.enum';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { ViewedPostEntity } from 'src/modules/posts/entities/viwed.entity';
import { NotificationGateway } from 'src/modules/notifications/notification.gateway';
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
    @Inject(forwardRef(() => NotificationGateway))
    private readonly notificationGateway: NotificationGateway,
  ) {}

  async markReadState(userId: number, dto: MarkUserReadStateDto) {
    let response!: Record<string, unknown>;

    switch (dto.kind) {
      case USER_READ_STATE_KINDS.FEED: {
        const markedCount = await this.userActivityQueryService.markFeedAsRead(
          userId,
        );
        response = {
          status: 'success',
          kind: dto.kind,
          message: 'Activity feed marked as read',
          markedCount,
        };
        break;
      }

      case USER_READ_STATE_KINDS.REGULAR_CONTESTS: {
        const markedCount =
          await this.userActivityQueryService.markContestActivitiesAsReadByType(
            userId,
            ContestTypeEnum.DEFAULT,
          );

        response = {
          status: 'success',
          kind: dto.kind,
          message: 'Regular contests marked as read',
          markedCount,
        };
        break;
      }

      case USER_READ_STATE_KINDS.FINE_TUNE_CONTESTS: {
        const markedCount =
          await this.userActivityQueryService.markContestActivitiesAsReadByType(
            userId,
            ContestTypeEnum.FINE_TUNE,
          );

        response = {
          status: 'success',
          kind: dto.kind,
          message: 'Fine-tune contests marked as read',
          markedCount,
        };
        break;
      }

      case USER_READ_STATE_KINDS.STORIES: {
        const result = await this.markStoriesAsViewed(
          userId,
          dto.post_ids ?? [],
        );

        response = {
          status: 'success',
          kind: dto.kind,
          message: 'Stories marked as read',
          ...result,
        };
        break;
      }
    }

    await this.notificationGateway.emitProfileUpdate(userId.toString());

    return response;
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
