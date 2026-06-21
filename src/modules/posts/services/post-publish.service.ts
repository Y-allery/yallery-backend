import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import * as sharp from 'sharp';
import { Repository } from 'typeorm';
import { TagService } from 'src/modules/catalog/tags/tag.service';
import { ContestService } from 'src/modules/contests/contest.service';
import { NotificationGateway } from 'src/modules/notifications/notification.gateway';
import { RewardService } from 'src/modules/billing/rewards/reward.service';
import { RewardTypeEnum } from 'src/modules/billing/rewards/types/reward-type.enum';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { PostEntity } from '../entities/post.entity';

@Injectable()
export class PostPublishService {
  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly contestService: ContestService,
    private readonly tagService: TagService,
    @Inject(forwardRef(() => NotificationGateway))
    private readonly notificationGateway: NotificationGateway,
    private readonly rewardService: RewardService,
  ) {}

  async publishPost(postId: number, userId: number) {
    const post = await this.postRepository.findOne({
      where: { id: postId, user: { id: userId } },
      relations: { user: true, contest: true, tag: true },
      select: {
        id: true,
        imageUrl: true,
        videoUrl: true,
        user: { id: true },
        contest: { id: true },
        tag: { id: true },
      },
    });

    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { tags: true },
    });

    if (!post) {
      console.error(`[publishPost] Post not found or already published:`, { postId, userId });
      throw new NotFoundException('Post not found or already published');
    }

    if (post.user.id !== userId) {
      console.error(`[publishPost] User not allowed to publish:`, { postId, userId, postUserId: post.user.id });
      throw new ForbiddenException('You are not allowed to publish this post');
    }

    if (post.contest && !post.tag) {
      try {
        const contest = await this.contestService.findContestById(post.contest.id);
        if (contest && contest.tag) {
          post.tag = contest.tag;
          console.log(`[publishPost] Setting tag from contest:`, {
            postId,
            contestId: post.contest.id,
            tagId: contest.tag.id,
          });
        }
      } catch (error) {
        console.warn(`[publishPost] Failed to load contest tag:`, error.message);
      }
    }

    if (!post?.tag?.id) {
      console.error(`[publishPost] No tag selected:`, { postId, userId });
      throw new BadRequestException('Select tag first');
    }

    try {
      post.isPublished = true;

      if (post.contest) {
        await this.contestService.participateInContest(post.contest.id, userId);
      }

      await this.tagService.checkAndSubscribeToTag(user, post.tag.id);

      const savedPost = await this.postRepository.save(post);

      try {
        if (post.videoUrl) {
          await this.rewardService.markRewardEligible(userId, RewardTypeEnum.POST_VIDEO_REWARD);
        } else if (post.imageUrl) {
          await this.rewardService.markRewardEligible(userId, RewardTypeEnum.POST_PHOTO_REWARD);
        }
      } catch (error) {
        console.warn('[publishPost] Failed to mark reward eligible:', error);
      }

      return savedPost;
    } catch (error) {
      console.error(`[publishPost] Error publishing post:`, {
        postId,
        userId,
        error: error.message,
      });
      throw error;
    }
  }

  async updatePostMedia(
    postId: number,
    userId: number,
    dto: { imageUrl?: string; videoUrl?: string; previewImageUrl?: string },
  ) {
    const post = await this.postRepository.findOne({
      where: { id: postId, user: { id: userId } },
      relations: { user: true },
      select: { id: true, imageUrl: true, videoUrl: true, previewImageUrl: true, user: { id: true } },
    });

    if (!post) {
      throw new NotFoundException('Post not found or you are not the owner');
    }

    const imageUrl = dto.imageUrl?.trim();
    const videoUrl = dto.videoUrl?.trim();
    const hasImage = imageUrl && imageUrl.length > 0;
    const hasVideo = videoUrl && videoUrl.length > 0;

    if (!hasImage && !hasVideo) {
      throw new BadRequestException('Provide imageUrl or videoUrl');
    }
    if (hasImage && hasVideo) {
      throw new BadRequestException('Provide either imageUrl or videoUrl, not both');
    }

    if (hasImage) {
      post.imageUrl = imageUrl!;
      post.videoUrl = null;
      post.previewImageUrl = null;
    } else {
      post.videoUrl = videoUrl!;
      post.previewImageUrl = dto.previewImageUrl?.trim() || post.previewImageUrl || null;
      post.imageUrl = null;
    }

    await this.postRepository.save(post);
    return this.postRepository.findOne({
      where: { id: postId },
      relations: { user: true, tag: true },
    });
  }

  async deletePost(postId: number, userId: number): Promise<void> {
    const post = await this.postRepository.findOne({
      where: { id: postId, user: { id: userId } },
      relations: { user: true },
      select: { id: true, user: { id: true } },
    });

    if (!post) {
      throw new NotFoundException('Post not found or you are not the owner');
    }

    // Hard delete. Post-referencing foreign keys carry ON DELETE rules
    // (likes / viewed_posts / reports / user_activities -> CASCADE,
    // contest_submissions / contests.winnerPostId -> SET NULL,
    // contest_rewards -> CASCADE), so the database cleans up child rows.
    await this.postRepository.delete({ id: postId });
  }

  async share(
    userId: number,
  ): Promise<{ message: string; pointsAwarded: number }> {
    const dailyPoints = await this.rewardService.getRewardPointsOrDefault(
      RewardTypeEnum.SHARE_YEPS,
      5,
    );
    const now = new Date();
    const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));

    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.lastShareRewardAt && user.lastShareRewardAt >= startOfToday) {
      return {
        message: 'You have already received points for sharing today.',
        pointsAwarded: 0,
      };
    }

    // The check above is a fast-fail; this single conditional UPDATE is the
    // authoritative once-per-day gate. Only the request that flips
    // lastShareRewardAt past today's start awards points (atomic increment),
    // so two concurrent same-day shares can't both pay out, and there is no
    // full-entity save to clobber concurrent point changes.
    const award = await this.userRepository
      .createQueryBuilder()
      .update(UserEntity)
      .set({
        points: () => `points + ${dailyPoints}`,
        lastShareRewardAt: now,
      })
      .where('id = :id', { id: userId })
      .andWhere(
        '(lastShareRewardAt IS NULL OR lastShareRewardAt < :startOfToday)',
        { startOfToday },
      )
      .execute();

    if (!award.affected) {
      return {
        message: 'You have already received points for sharing today.',
        pointsAwarded: 0,
      };
    }

    await this.notificationGateway.emitProfileUpdate(userId.toString());
    return {
      message: 'Points awarded successfully for sharing.',
      pointsAwarded: dailyPoints,
    };
  }

  private async getImageDimensions(
    imageUrl: string,
  ): Promise<{ width: number; height: number } | null> {
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
      });
      const imageBuffer = Buffer.from(response.data, 'binary');
      const metadata = await sharp(imageBuffer).metadata();

      if (metadata.width && metadata.height) {
        return {
          width: metadata.width,
          height: metadata.height,
        };
      }
      return null;
    } catch (error) {
      console.warn(`[savePost] Failed to get image dimensions from ${imageUrl}:`, error?.message || error);
      return null;
    }
  }
}
