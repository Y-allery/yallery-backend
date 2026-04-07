import { TagService } from './../tag/tag.service';
import { getBrowser, performRandomActions, randomDelay, setupPage, checkForBlocking, simulateHumanBehavior, humanDelay, humanType, visitRandomTwitterPages, aggressiveCleanup, touchBrowserActivity } from 'src/common/puppeteer-browser';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { PostEntity } from './entities/post.entity';
import { TagEntity } from 'src/tag/entities/tag.entity';
import { ViewedPostEntity } from './entities/viwed.entity';
import { UserEntity } from 'src/user/entities/user.entity';
import { GenerateImageDto } from 'src/image-generation/dto/generate.image.dto';
import { ContestService } from 'src/contest/contest.service';
import { ReportPostDto } from './dto/report.post.dto';
import { ReportPostEntity } from './entities/report.post.entity';
import { StyleEntity } from './entities/style.entity';
import { CreateStyleDto } from './dto/create.style.dto';
import { ActivityService } from 'src/activity/activity.service';
import { ActivityEnum } from 'src/activity/types/activity.enum';
import { RoleEnum } from 'src/user/types/role.enum';
import * as sharp from 'sharp';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { PartnershipActivityEntity } from 'src/admin/entities/partnership-activity.entity';
import { PartnerUserLinkEntity } from 'src/admin/entities/partner-user-link.entity';
import { RewardService } from 'src/reward/reward.service';
import { RewardTypeEnum } from 'src/reward/types/reward-type.enum';
import { v2 as cloudinary } from 'cloudinary';
import { StandardPost } from 'src/common/types/standard-post.type';
import { PopularPostsResponse } from './types/popular-post.interface';

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
const randomSleep = async () =>
  await sleep(1000 + Math.floor(Math.random() * 1000));

@Injectable()
export class PostService {
  constructor(
    @InjectRepository(PostEntity)
    private postEntity: Repository<PostEntity>,
    @InjectRepository(StyleEntity)
    private styleEntity: Repository<StyleEntity>,
    @InjectRepository(TagEntity)
    private tagEntity: Repository<TagEntity>,
    @InjectRepository(UserEntity)
    private userEntity: Repository<UserEntity>,
    @InjectRepository(ViewedPostEntity)
    private viwedPostEntity: Repository<ViewedPostEntity>,
    @InjectRepository(ReportPostEntity)
    private reportPostEntity: Repository<ReportPostEntity>,
    @InjectRepository(ViewedPostEntity)
    private viewedPostRepository: Repository<ViewedPostEntity>,
    @InjectRepository(PostEntity)
    private postRepository: Repository<PostEntity>,
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    private contestService: ContestService,
    private activityService: ActivityService,
    private tagService: TagService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => NotificationGateway))
    private readonly notificationGateway: NotificationGateway,
    @InjectRepository(PartnerUserLinkEntity)
    private readonly partnerUserLinkRepo: Repository<PartnerUserLinkEntity>,
    @InjectRepository(PartnershipActivityEntity)
    private readonly partnershipActivityRepo: Repository<PartnershipActivityEntity>,
    private readonly rewardService: RewardService,
  ) {
    // Initialize Cloudinary config for video metadata
    cloudinary.config({
      cloud_name: this.configService.get('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get('CLOUDINARY_API_SECRET'),
    });
  }

  async getPosts(
    cursor: number | null,
    limit: number,
    userId: number,
    tagId: number | null = null,
  ) {
    // Безпечний ліміт: від 1 до 100, щоб не навантажувати БД
    const safeLimit = Math.min(Math.max(limit || 20, 1), 100);
    const cursorCondition = cursor ? `AND p.id < ${cursor}` : '';
    const tagCondition = tagId ? `AND p.tagId = ${tagId}` : '';

    const query = `
      SELECT DISTINCT
        p.id AS id, 
        p.imageUrl AS imageUrl, 
        p.videoUrl AS videoUrl, 
        p.previewImageUrl AS previewImageUrl,
        p.createdAt AS createdAt,
        u.id AS userId,
        u.nickname AS username,
        t.id AS tagId,
        CONCAT('#', t.name) AS tagName,
        (SELECT COUNT(*) FROM likes WHERE postId = p.id) AS likeCount,
        (SELECT COUNT(*) FROM viewed_posts WHERE postId = p.id) AS viewCount,
        CASE 
          WHEN EXISTS (SELECT 1 FROM likes WHERE postId = p.id AND userId = ${userId}) 
          THEN TRUE 
          ELSE FALSE 
        END AS isLiked,
        CASE 
          WHEN EXISTS (SELECT 1 FROM viewed_posts WHERE postId = p.id AND userId = ${userId}) 
          THEN TRUE 
          ELSE FALSE 
        END AS isViewed,
        p.generationParams AS generationParams,
        p.isPublished AS isPublished,
        p.hasAudio AS hasAudio
      FROM 
        posts p
        JOIN users u ON p.userId = u.id
        JOIN tags t ON p.tagId = t.id
      WHERE 
        p.isPublished = true 
        AND p.isBlocked = false
        AND NOT EXISTS (SELECT 1 FROM viewed_posts WHERE postId = p.id AND userId = ${userId})
        AND p.tagId IN (
          SELECT tagsId
          FROM users_tags_tags t
          WHERE t.usersId = ${userId}
        )
        ${tagCondition} -- Optional tag filter
        ${cursorCondition} -- Додаємо умову курсора
      ORDER BY 
        p.id DESC -- Порядок для курсора
      LIMIT ${safeLimit};
    `;

    const posts = await this.postEntity.query(query);
    const nextCursor = posts.length > 0 ? posts[posts.length - 1].id : null;

    // Normalize generationParams
    const normalizedPosts = posts.map((post) => ({
      ...post,
      generationParams: this.normalizeGenerationParams(post.generationParams),
    }));

    return {
      data: normalizedPosts,
      nextCursor,
      hasNextPage: posts.length === safeLimit,
    };
  }

  private normalizeGenerationParams(params: any): any {
    if (!params || typeof params !== 'object' || Object.keys(params).length === 0) {
      return {
        prompt: 'Unknown',
        ai_service: 'flux',
        orientation: 'vertical',
        suggestedTags: [],
      };
    }

    return {
      prompt: params.prompt || 'Unknown',
      ai_service: params.ai_service || 'flux',
      orientation: params.orientation || 'vertical',
      style_id: params.style_id,
      color_id: params.color_id,
      width: params.width,
      height: params.height,
      negative_prompt: params.negative_prompt,
      suggestedTags: Array.isArray(params.suggestedTags) ? params.suggestedTags : [],
    };
  }

  async findPostsByTag(
    tagId: number,
    page: number,
    limit: number,
    userId?: number,
  ): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const offset = (page - 1) * limit;

    const postsQuery = `
      SELECT DISTINCT
        p.id AS id,
        p.imageUrl AS imageUrl,
        p.videoUrl AS videoUrl,
        p.previewImageUrl AS previewImageUrl,
        p.createdAt AS createdAt,
        u.id AS userId,
        u.nickname AS username,
        t.id AS tagId,
        CONCAT('#', t.name) AS tagName,
        (SELECT COUNT(*) FROM likes WHERE postId = p.id) AS likeCount,
        (SELECT COUNT(*) FROM viewed_posts WHERE postId = p.id) AS viewCount,
        CASE 
          WHEN EXISTS (SELECT 1 FROM likes WHERE postId = p.id AND userId = ${userId || 0}) 
          THEN TRUE 
          ELSE FALSE 
        END AS isLiked,
        CASE 
          WHEN EXISTS (SELECT 1 FROM viewed_posts WHERE postId = p.id AND userId = ${userId || 0}) 
          THEN TRUE 
          ELSE FALSE 
        END AS isViewed,
        p.generationParams AS generationParams,
        p.isPublished AS isPublished
      FROM posts p
      JOIN users u ON p.userId = u.id
      JOIN tags t ON p.tagId = t.id
      WHERE t.id = ? 
        AND p.isPublished = true
        AND p.isBlocked = false
        AND p.isRejected = false
      ORDER BY p.createdAt DESC
      LIMIT ? OFFSET ?
    `;

    const totalQuery = `
      SELECT COUNT(*) AS total
      FROM posts p
      WHERE p.tagId = ? 
        AND p.isPublished = true
        AND p.isBlocked = false
        AND p.isRejected = false
    `;

    const [posts, totalResult] = await Promise.all([
      this.postEntity.query(postsQuery, [tagId, limit, offset]),
      this.postEntity.query(totalQuery, [tagId]),
    ]);

    const total = parseInt(totalResult[0]?.total || '0', 10);
    
    // Normalize generationParams
    const normalizedPosts = posts.map((post) => ({
      ...post,
      generationParams: this.normalizeGenerationParams(post.generationParams),
    }));

    return {
      data: normalizedPosts,
      total,
      page,
      limit,
    };
  }

  async publishPost(postId: number, userId: number) {
    const post = await this.postEntity.findOne({
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
    
    const user = await this.userEntity.findOne({
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

    // Якщо є contest_id і у контесту є tag, встановлюємо tag з контесту
    if (post.contest && !post.tag) {
      try {
        const contest = await this.contestService.findContestById(post.contest.id);
        if (contest && contest.tag) {
          post.tag = contest.tag;
          console.log(`[publishPost] Setting tag from contest:`, { 
            postId, 
            contestId: post.contest.id, 
            tagId: contest.tag.id 
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
      
      const savedPost = await this.postEntity.save(post);
      
      // Відмічаємо доступність нагороди за публікацію
      try {
        // IMPORTANT: use the loaded `post` fields; `save()` won't populate non-selected columns.
        if (post.videoUrl) {
          // Це відео пост
          await this.rewardService.markRewardEligible(userId, RewardTypeEnum.POST_VIDEO_REWARD);
        } else if (post.imageUrl) {
          // Це фото пост
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
        error: error.message
      });
      throw error;
    }
  }

  async updatePostMedia(
    postId: number,
    userId: number,
    dto: { imageUrl?: string; videoUrl?: string; previewImageUrl?: string },
  ) {
    const post = await this.postEntity.findOne({
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

    await this.postEntity.save(post);
    return this.postEntity.findOne({
      where: { id: postId },
      relations: { user: true, tag: true },
    });
  }

  async getUnpublishedPosts(
    userId: number,
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const safePage = Math.max(1, page || 1);
    const safeLimit = Math.min(Math.max(limit || 10, 1), 100);
    const offset = (safePage - 1) * safeLimit;

    const query = `
      SELECT 
        p.id AS id,
        p.imageUrl AS imageUrl,
        p.videoUrl AS videoUrl,
        p.previewImageUrl AS previewImageUrl,
        p.createdAt AS createdAt,
        u.id AS userId,
        u.nickname AS username,
        t.id AS tagId,
        CASE WHEN t.name IS NOT NULL THEN CONCAT('#', t.name) ELSE NULL END AS tagName,
        COALESCE((SELECT COUNT(*) FROM likes WHERE postId = p.id), 0) AS likeCount,
        COALESCE((SELECT COUNT(*) FROM viewed_posts WHERE postId = p.id), 0) AS viewCount,
        FALSE AS isLiked,
        FALSE AS isViewed,
        p.generationParams AS generationParams,
        p.isPublished AS isPublished,
        p.hasAudio AS hasAudio
      FROM posts p
      LEFT JOIN users u ON p.userId = u.id
      LEFT JOIN tags t ON p.tagId = t.id
      WHERE p.userId = ? AND p.isSaved = true AND p.isPublished = false
      ORDER BY p.createdAt DESC
      LIMIT ? OFFSET ?
    `;

    const totalQuery = `
      SELECT COUNT(*) AS total
      FROM posts p
      WHERE p.userId = ? AND p.isSaved = true AND p.isPublished = false
    `;

    const [posts, totalResult] = await Promise.all([
      this.postEntity.query(query, [userId, safeLimit, offset]),
      this.postEntity.query(totalQuery, [userId]),
    ]);

    const total = parseInt(totalResult[0]?.total || '0', 10);
    const totalPages = Math.ceil(total / safeLimit) || 1;

    const data = posts.map((post) => {
      const rawParams =
        typeof post.generationParams === 'string'
          ? (() => {
              try {
                return JSON.parse(post.generationParams);
              } catch {
                return null;
              }
            })()
          : post.generationParams;
      const generationParams = this.normalizeGenerationParams(rawParams);
      const suggestedTags =
        rawParams && Array.isArray(rawParams.suggestedTags)
          ? rawParams.suggestedTags
          : [];
      return {
        ...post,
        generationParams,
        suggestedTags,
      };
    });

    return {
      data,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages,
    };
  }

  async getPublishedPosts(
    userId: number,
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const safePage = Math.max(1, page || 1);
    const safeLimit = Math.min(Math.max(limit || 10, 1), 100);
    const offset = (safePage - 1) * safeLimit;

    const query = `
      SELECT 
        p.id AS id,
        p.imageUrl AS imageUrl,
        p.videoUrl AS videoUrl,
        p.previewImageUrl AS previewImageUrl,
        p.createdAt AS createdAt,
        u.id AS userId,
        u.nickname AS username,
        t.id AS tagId,
        CASE WHEN t.name IS NOT NULL THEN CONCAT('#', t.name) ELSE NULL END AS tagName,
        COALESCE((SELECT COUNT(*) FROM likes WHERE postId = p.id), 0) AS likeCount,
        COALESCE((SELECT COUNT(*) FROM viewed_posts WHERE postId = p.id), 0) AS viewCount,
        CASE 
          WHEN EXISTS (SELECT 1 FROM likes WHERE postId = p.id AND userId = ?) 
          THEN TRUE 
          ELSE FALSE 
        END AS isLiked,
        CASE 
          WHEN EXISTS (SELECT 1 FROM viewed_posts WHERE postId = p.id AND userId = ?) 
          THEN TRUE 
          ELSE FALSE 
        END AS isViewed,
        p.generationParams AS generationParams,
        p.isPublished AS isPublished,
        p.hasAudio AS hasAudio
      FROM posts p
      LEFT JOIN users u ON p.userId = u.id
      LEFT JOIN tags t ON p.tagId = t.id
      WHERE p.userId = ? AND p.isPublished = true
      ORDER BY p.createdAt DESC
      LIMIT ? OFFSET ?
    `;

    const totalQuery = `
      SELECT COUNT(*) AS total
      FROM posts p
      WHERE p.userId = ? AND p.isPublished = true
    `;

    const [posts, totalResult] = await Promise.all([
      this.postEntity.query(query, [userId, userId, userId, safeLimit, offset]),
      this.postEntity.query(totalQuery, [userId]),
    ]);

    const total = parseInt(totalResult[0]?.total || '0', 10);
    const totalPages = Math.ceil(total / safeLimit) || 1;

    const data = posts.map((post) => {
      const rawParams =
        typeof post.generationParams === 'string'
          ? (() => {
              try {
                return JSON.parse(post.generationParams);
              } catch {
                return null;
              }
            })()
          : post.generationParams;
      const generationParams = this.normalizeGenerationParams(rawParams);
      const suggestedTags =
        rawParams && Array.isArray(rawParams.suggestedTags)
          ? rawParams.suggestedTags
          : [];
      return {
        ...post,
        generationParams,
        suggestedTags,
      };
    });

    return {
      data,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages,
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

      const todayQuery = `
        SELECT DISTINCT
          p.id AS id,
          p.imageUrl AS imageUrl,
          p.videoUrl AS videoUrl,
          p.previewImageUrl AS previewImageUrl,
          p.createdAt AS createdAt,
          u.id AS userId,
          u.nickname AS username,
          t.id AS tagId,
          CONCAT('#', t.name) AS tagName,
          p.\`isPublished\` AS isPublished,
          p.\`isBlocked\` AS isBlocked,
          p.\`isRejected\` AS isRejected,
          (SELECT COUNT(*) FROM likes WHERE postId = p.id) AS likeCount,
          (SELECT COUNT(*) FROM viewed_posts WHERE postId = p.id) AS viewCount,
          CASE
            WHEN EXISTS (SELECT 1 FROM likes WHERE postId = p.id AND userId = ${userId})
            THEN TRUE
            ELSE FALSE
          END AS isLiked,
          CASE
            WHEN EXISTS (SELECT 1 FROM viewed_posts WHERE postId = p.id AND userId = ${userId})
            THEN TRUE
            ELSE FALSE
          END AS isViewed,
          p.generationParams AS generationParams
        FROM
          posts p
          JOIN users u ON p.userId = u.id
          LEFT JOIN tags t ON p.tagId = t.id
        WHERE
          p.createdAt >= '${today.toISOString()}'
          AND p.createdAt < '${tomorrow.toISOString()}'
          AND p.\`isPublished\` = true
          AND p.\`isBlocked\` = false
          AND p.\`isRejected\` = false
          AND (p.imageUrl IS NOT NULL OR p.videoUrl IS NOT NULL)
        ORDER BY
          likeCount DESC, viewCount DESC
        LIMIT 6;
      `;

      const todayPosts = await this.postRepository.query(todayQuery);

      if (todayPosts.length > 0) {
        allFoundPosts.push(
          ...todayPosts.map((post) => ({
            post,
            period: 'today',
          })),
        );
        period = 'today';
      }

      if (allFoundPosts.length < 6) {
        const yesterdayQuery = `
          SELECT DISTINCT
            p.id AS id,
            p.imageUrl AS imageUrl,
            p.videoUrl AS videoUrl,
            p.previewImageUrl AS previewImageUrl,
            p.createdAt AS createdAt,
            u.id AS userId,
            u.nickname AS username,
            t.id AS tagId,
            CONCAT('#', t.name) AS tagName,
            p.isPublished AS isPublished,
            p.isBlocked AS isBlocked,
            p.isRejected AS isRejected,
            (SELECT COUNT(*) FROM likes WHERE postId = p.id) AS likeCount,
            (SELECT COUNT(*) FROM viewed_posts WHERE postId = p.id) AS viewCount,
            CASE
              WHEN EXISTS (SELECT 1 FROM likes WHERE postId = p.id AND userId = ${userId})
              THEN TRUE
              ELSE FALSE
            END AS isLiked,
            CASE
              WHEN EXISTS (SELECT 1 FROM viewed_posts WHERE postId = p.id AND userId = ${userId})
              THEN TRUE
              ELSE FALSE
            END AS isViewed,
            p.generationParams AS generationParams
          FROM
            posts p
            JOIN users u ON p.userId = u.id
            LEFT JOIN tags t ON p.tagId = t.id
          WHERE
            p.createdAt >= '${yesterday.toISOString()}'
            AND p.createdAt < '${today.toISOString()}'
            AND p.isPublished = true
            AND p.isBlocked = false
            AND p.isRejected = false
            AND (p.imageUrl IS NOT NULL OR p.videoUrl IS NOT NULL)
          ORDER BY
            likeCount DESC, viewCount DESC
          LIMIT ${6 - allFoundPosts.length};
        `;

        const yesterdayPosts = await this.postRepository.query(yesterdayQuery);

        if (yesterdayPosts.length > 0) {
          allFoundPosts.push(
            ...yesterdayPosts.map((post) => ({
              post,
              period: 'yesterday',
            })),
          );
          if (period === 'today') period = 'mixed';
          else period = 'yesterday';
        }
      }

      if (allFoundPosts.length < 6) {
        const allTimeQuery = `
          SELECT DISTINCT
            p.id AS id,
            p.imageUrl AS imageUrl,
            p.videoUrl AS videoUrl,
            p.previewImageUrl AS previewImageUrl,
            p.createdAt AS createdAt,
            u.id AS userId,
            u.nickname AS username,
            t.id AS tagId,
            CONCAT('#', t.name) AS tagName,
            p.isPublished AS isPublished,
            p.isBlocked AS isBlocked,
            p.isRejected AS isRejected,
            (SELECT COUNT(*) FROM likes WHERE postId = p.id) AS likeCount,
            (SELECT COUNT(*) FROM viewed_posts WHERE postId = p.id) AS viewCount,
            CASE
              WHEN EXISTS (SELECT 1 FROM likes WHERE postId = p.id AND userId = ${userId})
              THEN TRUE
              ELSE FALSE
            END AS isLiked,
            CASE
              WHEN EXISTS (SELECT 1 FROM viewed_posts WHERE postId = p.id AND userId = ${userId})
              THEN TRUE
              ELSE FALSE
            END AS isViewed,
            p.generationParams AS generationParams
          FROM
            posts p
            JOIN users u ON p.userId = u.id
            LEFT JOIN tags t ON p.tagId = t.id
          WHERE
            p.isPublished = true
            AND p.isBlocked = false
            AND p.isRejected = false
            AND (p.imageUrl IS NOT NULL OR p.videoUrl IS NOT NULL)
          ORDER BY
            likeCount DESC, viewCount DESC
          LIMIT ${6 - allFoundPosts.length};
        `;

        const allTimePosts = await this.postRepository.query(allTimeQuery);

        allFoundPosts.push(
          ...allTimePosts.map((post) => ({
            post,
            period: 'all_time',
          })),
        );

        if (period !== 'mixed') period = 'all_time';
      }

      allFoundPosts.sort((a, b) => {
        const aLikes = a.post.likeCount || 0;
        const bLikes = b.post.likeCount || 0;
        const aViews = a.post.viewCount || 0;
        const bViews = b.post.viewCount || 0;

        if (bLikes !== aLikes) {
          return bLikes - aLikes;
        }

        return bViews - aViews;
      });

      const topPosts = allFoundPosts.slice(0, 6);
      const formattedPosts = topPosts.map((item) => ({
        id: item.post.id,
        imageUrl: item.post.imageUrl,
        videoUrl: item.post.videoUrl,
        previewImageUrl: item.post.previewImageUrl,
        likeCount: item.post.likeCount || 0,
        viewCount: item.post.viewCount || 0,
        createdAt: item.post.createdAt,
        userId: item.post.userId,
        username: item.post.username || 'Unknown User',
        tagName: item.post.tagName,
        tagId: item.post.tagId,
        isPublished: item.post.isPublished,
        isBlocked: item.post.isBlocked || false,
        isRejected: item.post.isRejected || false,
        isLiked: item.post.isLiked,
        isViewed: item.post.isViewed,
        generationParams:
          this.normalizeGenerationParams(item.post.generationParams) || null,
      }));

      return {
        posts: formattedPosts,
        period,
        totalCount: formattedPosts.length,
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

    const response = {
      message:
        notFoundIds.length > 0
          ? 'Some posts were marked as viewed, but some posts were not found.'
          : 'All posts were successfully marked as viewed.',
      markedCount: newViewedPosts.length,
      notFoundIds,
    };

    return response;
  }
  private async getImageDimensions(imageUrl: string): Promise<{ width: number; height: number } | null> {
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 10000, // 10 seconds timeout
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

  async savePost(
    dto: GenerateImageDto,
    imageUrl: string,
    user_id: number,
    contest_id: number | null,
    suggestedTags?: { id: number; name: string }[],
  ) {
    // Get actual image dimensions from the generated image
    let actualWidth: number | undefined = undefined;
    let actualHeight: number | undefined = undefined;
    
    try {
      const dimensions = await this.getImageDimensions(imageUrl);
      if (dimensions) {
        actualWidth = Number(dimensions.width);
        actualHeight = Number(dimensions.height);
      }
    } catch (error) {
      // If failed to get dimensions, log warning but continue
      console.warn(`[savePost] Failed to get image dimensions from ${imageUrl}:`, error?.message || error);
    }

    const post = this.postEntity.create({
      user: { id: user_id },
      imageUrl,
      tag: null, // Don't assign tag automatically
      contest: { id: contest_id },
      isPublished: false,
      isSaved: true, // Mark as saved so it appears in unpublished gallery
      generationParams: {
        prompt: dto.prompt,
        aiService: dto.ai_service,
        orientation: dto.orientation,
        styleId: dto.style_id || undefined,
        colorId: dto.color_id || undefined,
        width: actualWidth,
        height: actualHeight,
        negativePrompt: undefined,
        suggestedTags: suggestedTags || undefined,
      },
    });
    const savedPost = await this.postEntity.save(post);
    return savedPost;
  }


  async blockPost(post_id: number) {
    const post = await this.postEntity.findOne({ where: { id: post_id } });
    if (!post) throw new NotFoundException('Post not found');

    post.isBlocked = true;
    await this.postEntity.save(post);
    return {
      success: true,
      message: 'Post blocked succesfully',
    };
  }

  async reportPost(dto: ReportPostDto, userId: number) {
    const { postId, description } = dto;

    const post = await this.postEntity.findOne({
      where: { id: postId },
      relations: ['user'],
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const existingReport = await this.reportPostEntity.findOne({
      where: {
        post: { id: postId },
        reportingUser: { id: userId },
      },
    });

    if (existingReport) {
      return { message: 'You have already reported this post' };
    }

    await this.activityService.createActivitiesV2({
      fromUserId: userId,
      toUserIds: [post.user.id],
      type: ActivityEnum.ADMIN_REPORT,
      isAdmin: true,
      post,
    });
    const newReport = this.reportPostEntity.create({
      reportingUser: { id: userId },
      reportedUser: { id: post.user.id },
      post,
      description,
    });

    await this.reportPostEntity.save(newReport);
    return { message: 'Report has been submitted successfully' };
  }

  async getReportPosts({ page, limit }: { page: number; limit: number }) {
    const offset = (page - 1) * limit;

    const queryBuilder = this.reportPostEntity
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.post', 'post')
      .leftJoinAndSelect('post.tag', 'tag')
      .leftJoinAndSelect('report.reportingUser', 'reportingUser')
      .leftJoinAndSelect('report.reportedUser', 'reportedUser')
      .orderBy('reportedUser.isDeleted', 'ASC')
      .addOrderBy('post.isBlocked', 'ASC')
      .addOrderBy('report.createdAt', 'DESC')
      .skip(offset)
      .take(limit);

    const [results, total] = await queryBuilder.getManyAndCount();

    return {
      data: results.map((report) => ({
        reportId: report.id,
        postId: report.post.id,
        postImageUrl: report.post.imageUrl,
        tagName: report.post.tag ? report.post.tag.name : null,
        reportingUserId: report.reportingUser.id,
        reportingUserName: report.reportingUser.name,
        reportedUserId: report.reportedUser.id,
        reportedUserName: report.reportedUser.name,
        description: report.description,
        reportDate: report.createdAt,
        is_user_blocked: report.reportedUser.isDeleted,
        is_post_blocked: report.post.isBlocked,
      })),
      total,
      page,
      limit,
    };
  }
  async unblockPost(post_id: number) {
    const post = await this.postEntity.findOne({
      where: { id: post_id, isBlocked: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    post.isBlocked = false;
    await this.postEntity.save(post);
    return {
      success: true,
      message: 'Post unblocked successfully',
    };
  }

  async createStyle(dto: CreateStyleDto): Promise<StyleEntity> {
    const newStyle = this.styleEntity.create(dto);
    return this.styleEntity.save(newStyle);
  }

  async findAllStyles(): Promise<StyleEntity[]> {
    return this.styleEntity.find();
  }

  async findStyleById(id: number): Promise<StyleEntity> {
    return this.styleEntity.findOne({ where: { id } });
  }

  async rejectComplaint(
    reportId: number,
  ): Promise<{ success: boolean; message: string }> {
    const report = await this.reportPostEntity.findOne({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    await this.reportPostEntity.remove(report);

    return {
      success: true,
      message: 'Complaint rejected and report deleted successfully.',
    };
  }

  async updateStyle(id: number, dto: CreateStyleDto): Promise<StyleEntity> {
    const style = await this.styleEntity.preload({
      id: id,
      ...dto,
    });
    if (!style) throw new NotFoundException(`Style with ID ${id} not found`);
    return this.styleEntity.save(style);
  }

  async deleteStyle(id: number): Promise<void> {
    const result = await this.styleEntity.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Style with ID ${id} not found`);
    }
  }

  async deleteUserAccount(user_id: number) {
    const user = await this.userEntity.findOne({
      where: { id: user_id, isDeleted: false },
    });
    if (!user) throw new NotFoundException('User not found');

    user.isDeleted = true;
    await this.userEntity.save(user);
    return { status: 'Success', message: 'User deleted successfully' };
  }

  async getPostById(postId: number): Promise<any> {
    const post = await this.postEntity.findOne({
      where: { id: postId },
      relations: ['user', 'tag', 'contest', 'likes'],
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return {
      id: post.id,
      imageUrl: post.imageUrl,
      createdAt: post.createdAt,
      user: {
        id: post.user.id,
        name: post.user.name,
        email: post.user.email,
        avatarUrl: post.user.avatar,
      },
      tag: {
        id: post.tag.id,
        name: post.tag.name,
      },
      contest: post.contest
        ? {
            id: post.contest.id,
            name: post.contest.name,
            status: post.contest.status,
            description: post.contest.description,
          }
        : null,
      likeCount: post.likes.length,
      isPublished: post.isPublished,
      isBlocked: post.isBlocked,
      isRejected: post.isRejected,
    };
  }

  async deleteReport(
    reportId: number,
  ): Promise<{ success: boolean; message: string }> {
    const report = await this.reportPostEntity.findOne({
      where: { id: reportId },
      relations: { reportedUser: true, reportingUser: true, post: true },
    });
    const admins = await this.userEntity.find({
      where: { role: RoleEnum.ADMIN },
    });
    if (!report) {
      throw new NotFoundException('Report not found');
    }

    await this.activityService.deleteAdminPostActivity(
      report.post.id,
      report.reportingUser.id,
    );
    await this.activityService.createActivitiesV2({
      fromUserId: null,
      toUserIds: admins.map((e) => e.id),
      type: ActivityEnum.ADMIN_REPORT_REVIEW,
      isAdmin: true,
      post: report.post,
    });

    await this.reportPostEntity.delete(reportId);
    return {
      success: true,
      message: 'Report deleted successfully',
    };
  }

  async getPostImageWithWatermark(
    postId: number,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const post = await this.postEntity.findOne({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }


    if (post.videoUrl) {
      try {
        const response = await axios.get(post.videoUrl, {
          responseType: 'arraybuffer',
        });

        return {
          buffer: Buffer.from(response.data, 'binary'),
          contentType: 'video/mp4',
          filename: `post_${postId}.mp4`,
        };
      } catch (error) {
        throw new NotFoundException('Error fetching video from URL');
      }
    }


    let imageBuffer: Buffer;
    try {
      const response = await axios.get(post.imageUrl, {
        responseType: 'arraybuffer',
      });
      imageBuffer = Buffer.from(response.data, 'binary');
    } catch (error) {
      throw new NotFoundException('Error fetching image from URL');
    }

    const watermarkPath = path.join(
      __dirname,
      '..',
      '..',
      'public',
      'watermark.png',
    );
    if (!fs.existsSync(watermarkPath)) {
      throw new NotFoundException('Watermark file not found');
    }
    const watermarkBuffer = fs.readFileSync(watermarkPath);

    let processedImageBuffer: Buffer;
    try {
      processedImageBuffer = await sharp(imageBuffer)
        .composite([{ input: watermarkBuffer, gravity: 'southeast' }])
        .toBuffer();
    } catch (error) {
      throw new Error('Error processing image');
    }

    return {
      buffer: processedImageBuffer,
      contentType: 'image/png',
      filename: `post_${postId}.png`,
    };
  }
  async share(
    userId: number,
  ): Promise<{ message: string; pointsAwarded: number }> {
    const dailyPoints = await this.rewardService.getRewardPointsOrDefault(
      RewardTypeEnum.SHARE_YEPS,
      5,
    );
    const now = new Date();
    const startOfToday = new Date(now.setHours(0, 0, 0, 0));

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

    user.lastShareRewardAt = now;
    user.points += dailyPoints;
    await this.userRepository.save(user);

    await this.notificationGateway.emitProfileUpdate(user.id.toString());
    return {
      message: 'Points awarded successfully for sharing.',
      pointsAwarded: dailyPoints,
    };
  }

  async tweetImageViaPuppeteer(
    post_id: string,
    userId: number,
  ): Promise<{ message: string; tweetUrl: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || !user.twitterUsername) {
      console.error(
        '[tweetImageViaPuppeteer] User not found or has no twitter username:',
        user?.twitterUsername || 'null',
      );
      throw new NotFoundException('User not found or has no twitter username');
    }
    const post = await this.postEntity.findOne({
      where: { id: +post_id },
      relations: ['contest', 'contest.tag'],
    });

    if (!post) {
      console.error('[tweetImageViaPuppeteer] Post not found');
      throw new NotFoundException('Post not found');
    }

    const SESSION_PATH = path.resolve(
      process.cwd(),
      'src',
      'public',
      'twitter-session.json',
    );

    // Try different browser paths
    const possiblePaths = [
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/snap/bin/chromium'
    ];
    
    // Try environment variable first, then different browser paths
    let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    
    if (!executablePath) {
      try {
        const fs = require('fs');
        for (const path of possiblePaths) {
          if (fs.existsSync(path)) {
            executablePath = path;
            break;
          }
        }
      } catch (error) {
        // Ignore error, will use bundled Chrome
      }
    }
    
    // Browser selection is internal detail; avoid verbose logging in production

    const browser = await getBrowser();
    const page = await browser.newPage();
    await setupPage(page);

    const TWITTER_USERNAME = this.configService.get<string>('TWITTER_USERNAME');
    const TWITTER_PASSWORD = this.configService.get<string>('TWITTER_PASSWORD');

    if (fs.existsSync(SESSION_PATH)) {
      const keepAlive = setInterval(() => touchBrowserActivity(), 5000);
      try {
      const cookies = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
      await page.setCookie(...cookies);
      await page.goto('https://twitter.com/home', {
        waitUntil: 'networkidle2',
      });

      await new Promise((res) => setTimeout(res, 3000));
      const is2faPrompt = await page.$(
        'input[name="text"][inputmode="numeric"]',
      );
      if (is2faPrompt) {
        await page.close();
        return await this._recoverSessionViaGmail(post_id, userId);
      }

      const isLoggedIn = await page.evaluate(() =>
        Boolean(
          document.querySelector(
            '[data-testid="SideNav_AccountSwitcher_Button"]',
          ),
        ),
      );

      if (isLoggedIn) {
        const res = await this._postTweet(page, post, user, TWITTER_USERNAME);
        clearInterval(keepAlive);
        return res;
      } else {
        // Skip if user is null or has no twitter username
        if (!user || !user.twitterUsername) {
          console.error(
            '[tweetImageViaPuppeteer] SKIPPING: User is null or has no twitter username:',
            user?.twitterUsername || 'null',
          );
          const res = { message: 'Skipped: User not found or no twitter username', tweetUrl: '' };
          clearInterval(keepAlive);
          return res;
        }
      }
      } finally {
        try { clearInterval(keepAlive); } catch {}
      }
    }

    

    const isCodeInputPresent = await page.$(
      'input[name="text"][inputmode="numeric"]',
    );

    if (isCodeInputPresent) {
      await page.close();
      return await this._recoverSessionViaGmail(post_id, userId);
    }

    await page.goto('https://twitter.com/login', { waitUntil: 'networkidle2' });

    await page.waitForSelector('input[name="text"]', { timeout: 10000 });
    await page.type('input[name="text"]', TWITTER_USERNAME);
    await page.keyboard.press('Enter');
    await randomSleep();

    try {
      await page.waitForSelector('input[name="text"]', { timeout: 3000 });
      const inputVisible = await page.$eval(
        'input[name="text"]',
        (el) => (el as HTMLElement).offsetParent !== null,
      );
      if (inputVisible) {
        await page.type('input[name="text"]', TWITTER_USERNAME);
        await page.keyboard.press('Enter');
        await randomSleep();
      }
    } catch (e) {}

    
    await page.waitForSelector('input[name="password"]', { timeout: 10000 });
    await page.type('input[name="password"]', TWITTER_PASSWORD);
    await page.keyboard.press('Enter');
    await randomSleep();

    try {
      await page.waitForSelector('input[data-testid="ocfEnterTextTextInput"]', {
        timeout: 5000,
      });

      const CONFIRM_CODE_PATH = path.resolve(
        __dirname,
        '..',
        '..',
        'public',
        'twitter-confirmation-code.txt',
      );

      let savedCode: string | null = null;
      if (fs.existsSync(CONFIRM_CODE_PATH)) {
        savedCode = fs.readFileSync(CONFIRM_CODE_PATH, 'utf8').trim();
      }

      if (savedCode) {
        await page.waitForSelector(
          'input[data-testid="ocfEnterTextTextInput"]',
          {
            timeout: 10000,
          },
        );

        const codeInput = await page.$(
          'input[data-testid="ocfEnterTextTextInput"]',
        );
        if (!codeInput) {
          await page.close();
          return await this._recoverSessionViaGmail(post_id, userId);
        }

        await codeInput.focus();
        await page.evaluate(() => {
          const el = document.activeElement as HTMLInputElement;
          if (el) el.value = '';
        });

        await page.type(
          'input[data-testid="ocfEnterTextTextInput"]',
          savedCode,
          {
            delay: 100,
          },
        );

        await page.keyboard.press('Enter');
        await randomSleep();


        const stillOnCodeInput = await page.$(
          'input[data-testid="ocfEnterTextTextInput"]',
        );
        if (stillOnCodeInput) {
          fs.unlinkSync(CONFIRM_CODE_PATH);
          await page.close();
          return await this._recoverSessionViaGmail(post_id, userId);
        }
      } else {
        await page.close();
        return await this._recoverSessionViaGmail(post_id, userId);
      }
    } catch (err) {}

    const cookies = await page.cookies();
    const requiredCookies = cookies.filter((cookie) =>
      ['auth_token', '_twitter_sess', 'ct0', 'att'].includes(cookie.name),
    );
    fs.writeFileSync(SESSION_PATH, JSON.stringify(requiredCookies, null, 2));

    // Skip if user is null
    if (!user) {
      console.error('[tweetImageViaPuppeteer] SKIPPING: User is null, cannot proceed');
      return { message: 'Skipped: User not found', tweetUrl: '' };
    }

    return await this._postTweet(page, post, user, TWITTER_USERNAME);
  }

  private async _postTweet(
    page: any,
    post: PostEntity,
    user: UserEntity,
    twitterUsername: string,
  ): Promise<{ message: string; tweetUrl: string }> {
    // Starting tweet process
    // Skip posting if user is null or has no twitter username
    if (!user || !user.twitterUsername) {
      console.error(
        '[_postTweet] SKIPPING: User is null or has no twitter username:',
        user?.twitterUsername || 'null',
      );
      return { message: 'Skipped: User not found or no twitter username', tweetUrl: '' };
    }
    
    
    const keepAlive = setInterval(() => touchBrowserActivity(), 5000);
    await visitRandomTwitterPages(page);
    
    await page.goto('https://twitter.com/compose/tweet', {
      waitUntil: 'networkidle2',
    });

    const isBlocked = await checkForBlocking(page);
    if (isBlocked) {
      console.warn('[_postTweet] Page appears to be blocked, skipping...');
      return { message: 'Skipped: Page blocked', tweetUrl: '' };
    }
    
    try {
      await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 15000 });
    } catch (e) {
      const fallbackSelectors = [
        '[data-testid="tweetTextarea"]',
        'div[role="textbox"]',
        'textarea'
      ];
      let found = false;
      for (const selector of fallbackSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          found = true;
          break;
        } catch (e) {
          // Continue to next selector
        }
      }
      if (!found) {
        throw new Error('Compose interface not found');
      }
    }

    await simulateHumanBehavior(page);
    await humanDelay();
    



    const tweetText = post.contest && post.contest.tag 
      ? `Generated by ${user.twitterUsername} #${post.contest.tag.name} #${post.id}`
      : post.tag 
        ? `Generated by ${user.twitterUsername} #${post.tag.name} #${post.id}`
        : `Generated by ${user.twitterUsername} #post #${post.id}`;
    
    try {
      await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });
      await humanType(page, '[data-testid="tweetTextarea_0"]', tweetText);
    } catch (error) {
      const selectors = [
        '[data-testid="tweetTextarea_0"]',
        '[data-testid="tweetTextarea"]',
        '[contenteditable="true"]',
        'div[role="textbox"]',
        'textarea'
      ];
      
      for (const selector of selectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await humanType(page, selector, tweetText);
            break;
          }
        } catch (e) {
  
        }
      }
    }

    
    const input = await page.$('input[type="file"]');
    if (!input) {
      throw new Error('Tweet image upload field not found');
    }

    const imagePath = await this.downloadImageToTmp(post.imageUrl);
    
    if (!fs.existsSync(imagePath)) {
      throw new Error('Image file was not saved');
    }

    try {
      await randomSleep();
      await input.uploadFile(imagePath);
      
      await simulateHumanBehavior(page);
      await humanDelay();
      
    } catch (error) {
      console.error('[_postTweet] ERROR uploading image:', error.message);
      throw error;
    }
    
    await page.focus('[data-testid="tweetTextarea_0"]');
    await page.keyboard.press('ArrowDown');
    await randomSleep();

    await simulateHumanBehavior(page);
    await humanDelay();

    
    let tweetButton = await page.$('[data-testid="tweetButton"]');
    
    if (!tweetButton) {
      // Primary tweetButton not found, trying fallback selectors
      const buttonSelectors = [
        '[data-testid="postButton"]',
        '[data-testid="tweetButtonInline"]',
        'button[type="submit"]',
        'div[role="button"][aria-label*="Post"]',
        'div[role="button"][data-testid="tweetButton"]'
      ];
      
      for (const selector of buttonSelectors) {
        try {
          tweetButton = await page.$(selector);
          if (tweetButton) {
            break;
          }
        } catch (e) {
          console.warn(`[_postTweet] Selector failed: ${e.message}`);
        }
      }
    }
    
    if (!tweetButton) {
      console.error('[_postTweet] All button selectors failed, taking screenshot for debug...');
      // Log available buttons for debugging
      const availableButtons = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
        return buttons.map(btn => ({
          testId: btn.getAttribute('data-testid'),
          ariaLabel: btn.getAttribute('aria-label'),
          innerText: (btn as HTMLElement).innerText?.substring(0, 50),
          className: btn.className?.substring(0, 50)
        })).slice(0, 5);
      });
      console.error('[_postTweet] Available buttons:', JSON.stringify(availableButtons, null, 2));
      throw new Error('Tweet button not found');
    }

    await page.focus('[data-testid="tweetTextarea_0"]');
    await page.keyboard.type(' ');
    await randomSleep();
    if (imagePath && fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
    const isButtonDisabled = await tweetButton.evaluate((btn) =>
      btn.hasAttribute('disabled'),
    );

    if (isButtonDisabled) {
      return {
        message: 'Tweet button disabled, tweet not sent.',
        tweetUrl: '',
      };
    }

    
    // Wait for CreateTweet (GraphQL) request with broader matching and longer timeout
    const tweetResponsePromise = page.waitForResponse(
      (res) => {
        if (res.request().method() !== 'POST') return false;
        const url = res.url();
        return /CreateTweet|PostTweet|TweetCreate|CreatePost/i.test(url) ||
               (/\/graphql\//i.test(url) && /Create|Tweet/i.test(url));
      },
      { timeout: 45000 },
    );

    // Click the found button element directly
    try {
      await tweetButton.focus();
      await tweetButton.click({ delay: 20 });
    } catch (clickError) {
      console.warn(`[_postTweet] Direct click failed: ${clickError.message}, trying fallback...`);
      // Fallback to query by data-testid
      await page.evaluate(() => {
        const btn = document.querySelector('[data-testid="tweetButton"], [data-testid="tweetButtonInline"], [data-testid="postButton"]');
        if (btn) (btn as HTMLElement).click();
      });
    }

    const tweetRes = await tweetResponsePromise;
    const tweetData = await tweetRes.json();
    
    const tweetId =
      tweetData.data.create_tweet.tweet_results.result.rest_id ||
      tweetData.data?.id;

    const tweetUrlFull = `https://twitter.com/${twitterUsername}/status/${tweetId}`;

    post.tweetLink = tweetUrlFull;
    
    // Log partnership activity 'posted_to_twitter'
    try {
      if (!user.id) {
        console.warn(
          '[_postTweet] Cannot log partnership activity: missing user.id',
        );
      } else {
        const links = await this.partnerUserLinkRepo.find({
          where: { userId: user.id },
        });
        for (const link of links) {
          const exists = await this.partnershipActivityRepo.findOne({
            where: {
              partnershipId: link.partnershipId,
              userId: user.id,
              activity: 'posted_to_twitter',
            },
          });
          if (exists) {
            continue;
          }
          const rec = this.partnershipActivityRepo.create({
            partnershipId: link.partnershipId,
            userId: user.id,
            activity: 'posted_to_twitter',
          });
          await this.partnershipActivityRepo.save(rec);
        }
      }
    } catch (error) {
      console.error(
        '[_postTweet] Failed to log partnership activity posted_to_twitter:',
        error?.stack || error,
      );
    }
    
    await this.postEntity.save(post);

    await page.browser().close();
    
    aggressiveCleanup();
    
    if (global.gc) {
      global.gc();
    }
    
    try {
      return {
      message: 'Tweet sent successfully',
      tweetUrl: tweetUrlFull,
      };
    } finally {
      try { clearInterval(keepAlive); } catch {}
    }
  }

  async downloadImageToTmp(
    imageUrl: string,
    filename?: string,
  ): Promise<string> {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
    });
    const buffer = Buffer.from(response.data, 'binary');
    const tmpFilePath = filename
      ? path.join(__dirname, '..', filename)
      : path.join(__dirname, '..', `tmp-upload-${Date.now()}.png`);
    fs.writeFileSync(tmpFilePath, buffer);
    return tmpFilePath;
  }

  private async _recoverSessionViaGmail(
    post_id: string,
    userId: number,
  ): Promise<{ message: string; tweetUrl: string }> {
    // Try different browser paths
    const possiblePaths = [
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/snap/bin/chromium'
    ];
    
    // Try environment variable first, then different browser paths
    let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    
    if (!executablePath) {
      try {
        const fs = require('fs');
        for (const path of possiblePaths) {
          if (fs.existsSync(path)) {
            executablePath = path;
            break;
          }
        }
      } catch (error) {
        // Ignore error, will use bundled Chrome
      }
    }
    
    // Browser selection is internal detail; avoid verbose logging here

    const browser = await getBrowser();

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const GMAIL = this.configService.get<string>('GMAIL_USERNAME');
    const GMAIL_PASS = this.configService.get<string>('GMAIL_PASSWORD');

    await page.goto(
      'https://accounts.google.com/signin/v2/identifier?service=mail',
      { waitUntil: 'networkidle2' },
    );
    await page
      .type('input[type="email"]', GMAIL)
      .catch((err) => console.error('Failed to type:', err));
    await page.keyboard.press('Enter');
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await page
      .type('input[type="password"]', GMAIL_PASS)
      .catch((err) => console.error('Failed to type:', err));
    await page.keyboard.press('Enter');
    await page.waitForNavigation({ waitUntil: 'domcontentloaded' });

    await page.goto('https://mail.google.com/mail/u/0/#inbox', {
      waitUntil: 'domcontentloaded',
    });
    await new Promise((resolve) => setTimeout(resolve, 10000));

    const code = await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll('span'));
      for (const el of spans) {
        const text = el.textContent || '';
        if (/Your X confirmation code is/i.test(text)) {
          const parts = text.split(' ');
          const index = parts.findIndex((w) => w.toLowerCase() === 'is');
          if (index !== -1 && parts[index + 1]) {
            return parts[index + 1].trim();
          }
        }
      }
      return null;
    });

    if (!code) {
      throw new Error('Confirmation code not found in Gmail');
    }
    
    const CONFIRMATION_CODE_PATH = path.resolve(
      __dirname,
      '..',
      '..',
      'public',
      'twitter-confirmation-code.txt',
    );
    fs.writeFileSync(CONFIRMATION_CODE_PATH, code);

    
    await page.close();
    return await this.tweetImageViaPuppeteer(post_id, userId);
  }
}
