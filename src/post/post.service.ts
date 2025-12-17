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
  ) {}

  async getPosts(cursor: number | null, limit: number, userId: number) {
    // Безпечний ліміт: від 1 до 100, щоб не навантажувати БД
    const safeLimit = Math.min(Math.max(limit || 20, 1), 100);
    const cursorCondition = cursor ? `AND p.id < ${cursor}` : '';

    const query = `
      SELECT DISTINCT
        p.id, 
        p.imageUrl AS image_url, 
        p.videoUrl AS video_url, 
        p.previewImageUrl AS preview_image_url,
        p.createdAt AS created_at,
        u.id AS user_id,
        t.id AS tag_id,
        CONCAT('#', t.name) AS tag_name,
        (SELECT COUNT(*) FROM likes WHERE postId = p.id) AS like_count,
        CASE 
          WHEN EXISTS (SELECT 1 FROM likes WHERE postId = p.id AND userId = ${userId}) 
          THEN TRUE 
          ELSE FALSE 
        END AS is_liked,
        FALSE AS is_viewed,
        p.generation_params
      FROM 
        posts p
        JOIN users u ON p.userId = u.id
        JOIN tags t ON p.tagId = t.id
      WHERE 
        p.is_published = true 
        AND p.is_blocked = false
        AND NOT EXISTS (SELECT 1 FROM viewed_posts WHERE postId = p.id AND userId = ${userId})
        AND p.tagId IN (
          SELECT tagsId
          FROM users_tags_tags t
          WHERE t.usersId = ${userId}
        )
        ${cursorCondition} -- Додаємо умову курсора
      ORDER BY 
        p.id DESC -- Порядок для курсора
      LIMIT ${safeLimit};
    `;

    const posts = await this.postEntity.query(query);
    const nextCursor = posts.length > 0 ? posts[posts.length - 1].id : null;

    const normalizedPosts = posts.map((post) => ({
      ...post,
      generation_params: this.normalizeGenerationParams(post.generation_params),
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
    };
  }

  async findPostsByTag(
    tagId: number,
    page: number,
    limit: number,
  ): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const offset = (page - 1) * limit;

    const postsQuery = this.tagEntity
      .createQueryBuilder('tag')
      .leftJoinAndSelect('tag.posts', 'post')
      .leftJoinAndSelect('post.user', 'user')
      .leftJoin('post.likes', 'like')
      .select([
        'post.id AS post_id',
        'post.imageUrl AS post_imageUrl',
        'post.videoUrl AS post_videoUrl',
        'post.createdAt AS post_createdAt',
        'user.id AS user_id',
        'tag.id AS tag_id',
        `CONCAT('#', tag.name) AS tag_name`,
        `(SELECT COUNT(*) FROM likes l WHERE l.postId = post.id) AS likeCount`,
        'post.generation_params AS post_generation_params',
      ])
      .where('tag.id = :tagId', { tagId })
      .andWhere('post.is_published = :is_published', { is_published: true })
      .andWhere('post.is_blocked = :is_blocked', { is_blocked: false })
      .andWhere('post.is_rejected = :is_rejected', { is_rejected: false })
      .groupBy('post.id')
      .orderBy('post.createdAt', 'DESC')
      .offset(offset)
      .limit(limit)
      .getRawMany();

    const totalQuery = this.postEntity
      .createQueryBuilder('post')
      .where('post.tagId = :tagId', { tagId })
      .getCount();

    const [posts, total] = await Promise.all([postsQuery, totalQuery]);

    const normalizedPosts = posts.map((post) => ({
      ...post,
      post_generation_params: this.normalizeGenerationParams(post.post_generation_params),
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

    if (!post?.tag?.id) {
      console.error(`[publishPost] No tag selected:`, { postId, userId });
      throw new BadRequestException('Select tag first');
    }

    try {
      post.is_published = true;
      
      if (post.contest) {
        await this.contestService.participateInContest(post.contest.id, userId);
      }

      await this.tagService.checkAndSubscribeToTag(user, post.tag.id);
      
      const savedPost = await this.postEntity.save(post);
      
      // Відмічаємо доступність нагороди за публікацію
      try {
        if (savedPost.videoUrl) {
          // Це відео пост
          await this.rewardService.markRewardEligible(userId, RewardTypeEnum.POST_VIDEO_REWARD);
        } else if (savedPost.imageUrl) {
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
  async getUnpublishedPosts(userId: number) {
    const query = `
      SELECT 
        p.id,
        p.imageUrl,
        p.videoUrl,
        p.previewImageUrl,
        p.createdAt,
        p.updatedAt,
        p.is_published,
        p.is_saved,
        p.is_blocked,
        p.is_rejected,
        p.is_delivered,
        p.hasWonDailyReward,
        p.generation_params,
        p.tweetLink,
        p.contestId,
        p.tagId,
        p.userId,
        COALESCE(COUNT(DISTINCT l.id), 0) AS like_count
      FROM posts p
      LEFT JOIN likes l ON l.postId = p.id
      WHERE p.userId = ? AND p.is_saved = true
      GROUP BY 
        p.id, p.imageUrl, p.videoUrl, p.previewImageUrl, p.createdAt, p.updatedAt,
        p.is_published, p.is_saved, p.is_blocked, p.is_rejected, p.is_delivered,
        p.hasWonDailyReward, p.generation_params, p.tweetLink, p.contestId, p.tagId, p.userId
      ORDER BY p.createdAt DESC
    `;

    return await this.postEntity.query(query, [userId]);
  }
  async getPublishedPosts(userId: number) {
    const query = `
      SELECT 
        p.id,
        p.imageUrl,
        p.videoUrl,
        p.previewImageUrl,
        p.createdAt,
        p.updatedAt,
        p.is_published,
        p.is_saved,
        p.is_blocked,
        p.is_rejected,
        p.is_delivered,
        p.hasWonDailyReward,
        p.generation_params,
        p.tweetLink,
        p.contestId,
        p.tagId,
        p.userId,
        COALESCE(COUNT(DISTINCT l.id), 0) AS like_count
      FROM posts p
      LEFT JOIN likes l ON l.postId = p.id
      WHERE p.userId = ? AND p.is_published = true
      GROUP BY 
        p.id, p.imageUrl, p.videoUrl, p.previewImageUrl, p.createdAt, p.updatedAt,
        p.is_published, p.is_saved, p.is_blocked, p.is_rejected, p.is_delivered,
        p.hasWonDailyReward, p.generation_params, p.tweetLink, p.contestId, p.tagId, p.userId
      ORDER BY p.createdAt DESC
    `;

    return await this.postEntity.query(query, [userId]);
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
      is_published: false,
      generation_params: {
        prompt: dto.prompt,
        ai_service: dto.ai_service,
        orientation: dto.orientation,
        style_id: dto.style_id || undefined,
        color_id: dto.color_id || undefined,
        width: actualWidth,
        height: actualHeight,
        negative_prompt: undefined,
        suggestedTags: suggestedTags || undefined,
      },
    });
    const savedPost = await this.postEntity.save(post);
    return savedPost;
  }

  async updatePostsDimensionsBatch(
    batchSize: number = 10,
    delayBetweenBatches: number = 100,
  ): Promise<{ message: string; total: number }> {
    // No delays - process as fast as possible
    const delayBetweenBatchesMs = 0;
    // No delay between individual posts
    const delayBetweenPostsMs = 0;
    
    // Get total count first to return immediately
    const countResult = await this.postEntity.query(
      'SELECT COUNT(*) as count FROM posts WHERE imageUrl IS NOT NULL',
    );
    const totalCount = parseInt(countResult[0]?.count || '0', 10);
    
    console.log(`[updatePostsDimensionsBatch] Starting background batch processing...`);
    console.log(`[updatePostsDimensionsBatch] Total posts to process: ${totalCount}`);
    console.log(`[updatePostsDimensionsBatch] Batch size: ${batchSize}`);
    console.log(`[updatePostsDimensionsBatch] Delay between batches: ${delayBetweenBatchesMs}ms (fixed)`);
    console.log(`[updatePostsDimensionsBatch] Delay between posts: ${delayBetweenPostsMs}ms (fixed)`);

    // Start processing in background (don't await)
    this.processPostsDimensionsInBackground(batchSize, delayBetweenBatchesMs, delayBetweenPostsMs).catch((error) => {
      console.error(`[updatePostsDimensionsBatch] Background processing error:`, error);
    });

    // Return immediately
    return {
      message: 'Batch processing started in background. Check logs for progress.',
      total: totalCount,
    };
  }

  private async processPostsDimensionsInBackground(
    batchSize: number,
    delayBetweenBatchesMs: number,
    delayBetweenPostsMs: number,
  ): Promise<void> {
    const startTime = Date.now();

    // Get all posts with imageUrl (always process all posts)
    // First, let's check total posts count for debugging
    const totalPostsResult = await this.postEntity.query(
      'SELECT COUNT(*) as count FROM posts',
    );
    const totalPosts = parseInt(totalPostsResult[0]?.count || '0', 10);
    console.log(`[updatePostsDimensionsBatch] Total posts in database: ${totalPosts}`);

    // Check posts with NULL imageUrl
    const nullImageUrlResult = await this.postEntity.query(
      'SELECT COUNT(*) as count FROM posts WHERE imageUrl IS NULL',
    );
    const nullImageUrlCount = parseInt(nullImageUrlResult[0]?.count || '0', 10);
    console.log(`[updatePostsDimensionsBatch] Posts with NULL imageUrl: ${nullImageUrlCount}`);

    // Check posts with empty string imageUrl (use LENGTH for MySQL compatibility)
    const emptyImageUrlResult = await this.postEntity.query(
      'SELECT COUNT(*) as count FROM posts WHERE imageUrl IS NOT NULL AND LENGTH(imageUrl) = 0',
    );
    const emptyImageUrlCount = parseInt(emptyImageUrlResult[0]?.count || '0', 10);
    console.log(`[updatePostsDimensionsBatch] Posts with empty string imageUrl: ${emptyImageUrlCount}`);

    // Use raw SQL query to ensure we get ALL posts without any TypeORM limitations
    // Check for both NULL and empty string (as some posts might have empty strings)
    // Use LENGTH > 0 to check for non-empty strings
    const countResult = await this.postEntity.query(
      'SELECT COUNT(*) as count FROM posts WHERE imageUrl IS NOT NULL AND LENGTH(imageUrl) > 0',
    );
    const totalCount = parseInt(countResult[0]?.count || '0', 10);
    
    console.log(`[updatePostsDimensionsBatch] Total posts with valid imageUrl in database: ${totalCount}`);

    // Get all posts using raw SQL to avoid any limitations
    // Also exclude empty strings using LENGTH
    const allPostsRaw = await this.postEntity.query(`
      SELECT id, imageUrl, generation_params 
      FROM posts 
      WHERE imageUrl IS NOT NULL AND LENGTH(imageUrl) > 0
    `);

    // Transform raw results to match expected format
    const allPosts = allPostsRaw.map((post: any) => ({
      id: post.id,
      imageUrl: post.imageUrl,
      generation_params: post.generation_params,
    }));

    let processed = 0;
    let updated = 0;
    let failed = 0;
    const total = allPosts.length;

    console.log(`[updatePostsDimensionsBatch] Retrieved ${total} posts from database`);
    
    if (total !== totalCount) {
      console.warn(`[updatePostsDimensionsBatch] ⚠️ WARNING: Retrieved ${total} posts but database has ${totalCount} posts!`);
    } else {
      console.log(`[updatePostsDimensionsBatch] ✅ Successfully retrieved all ${total} posts`);
    }

    // Process posts in batches with delay to not block event loop
    const totalBatches = Math.ceil(total / batchSize);
    for (let i = 0; i < allPosts.length; i += batchSize) {
      const batchNumber = Math.floor(i / batchSize) + 1;
      const batch = allPosts.slice(i, i + batchSize);
      
      console.log(`[updatePostsDimensionsBatch] Processing batch ${batchNumber}/${totalBatches} (${batch.length} posts)...`);
      
      // Process batch - only update posts missing width and height
      // Process posts sequentially with delay to not block event loop
      for (const post of batch) {
        try {
          // Skip if no imageUrl
          if (!post.imageUrl) {
            processed++;
            continue;
          }

          // Check if width and height already exist in generation_params
          let existingParams = post.generation_params;
          if (!existingParams || typeof existingParams !== 'object') {
            existingParams = {};
          }

          // Skip if already has width and height
          if (
            existingParams.width &&
            existingParams.height &&
            typeof existingParams.width === 'number' &&
            typeof existingParams.height === 'number'
          ) {
            processed++;
            continue;
          }

          // Get image dimensions only if missing
          const dimensions = await this.getImageDimensions(post.imageUrl);
          
          if (dimensions) {
            // Update generation_params with real dimensions
            const updatedParams = {
              ...existingParams,
              width: dimensions.width,
              height: dimensions.height,
            };

            await this.postEntity.update(
              { id: post.id },
              { generation_params: updatedParams },
            );
            updated++;
            processed++;
          } else {
            failed++;
            processed++;
          }
        } catch (error) {
          console.error(`[updatePostsDimensionsBatch] Failed to process post ${post.id}:`, error?.message || error);
          failed++;
          processed++;
        }

        // No delay between posts
      }

      // Log progress after each batch
      const progress = ((processed / total) * 100).toFixed(2);
      console.log(`[updatePostsDimensionsBatch] Batch ${batchNumber}/${totalBatches} completed. Progress: ${progress}% (${processed}/${total}) | Updated: ${updated} | Failed: ${failed}`);

      // No delay between batches - process as fast as possible
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`[updatePostsDimensionsBatch] ✅ All batches completed! Processing finished.`);
    console.log(`[updatePostsDimensionsBatch] ==========================================`);
    console.log(`[updatePostsDimensionsBatch] Final Statistics:`);
    console.log(`[updatePostsDimensionsBatch] Total posts: ${total}`);
    console.log(`[updatePostsDimensionsBatch] Processed: ${processed}`);
    console.log(`[updatePostsDimensionsBatch] Updated: ${updated}`);
    console.log(`[updatePostsDimensionsBatch] Failed: ${failed}`);
    console.log(`[updatePostsDimensionsBatch] Duration: ${duration}s`);
    console.log(`[updatePostsDimensionsBatch] ==========================================`);
  }

  async updatePostsSuggestedTagsBatch(
    batchSize: number = 10,
    delayBetweenBatches: number = 100,
  ): Promise<{ message: string; total: number }> {
    // No delays - process as fast as possible
    const delayBetweenBatchesMs = 0;
    const delayBetweenPostsMs = 0;
    
    // Get total count first to return immediately
    const countResult = await this.postEntity.query(
      'SELECT COUNT(*) as count FROM posts',
    );
    const totalCount = parseInt(countResult[0]?.count || '0', 10);
    
    console.log(`[updatePostsSuggestedTagsBatch] Starting background batch processing...`);
    console.log(`[updatePostsSuggestedTagsBatch] Total posts to process: ${totalCount}`);
    console.log(`[updatePostsSuggestedTagsBatch] Batch size: ${batchSize}`);
    console.log(`[updatePostsSuggestedTagsBatch] Delay between batches: ${delayBetweenBatchesMs}ms (fixed)`);
    console.log(`[updatePostsSuggestedTagsBatch] Delay between posts: ${delayBetweenPostsMs}ms (fixed)`);

    // Start processing in background (don't await)
    this.processPostsSuggestedTagsInBackground(batchSize, delayBetweenBatchesMs, delayBetweenPostsMs).catch((error) => {
      console.error(`[updatePostsSuggestedTagsBatch] Background processing error:`, error);
    });

    // Return immediately
    return {
      message: 'Batch processing started in background. Check logs for progress.',
      total: totalCount,
    };
  }

  private async processPostsSuggestedTagsInBackground(
    batchSize: number,
    delayBetweenBatchesMs: number,
    delayBetweenPostsMs: number,
  ): Promise<void> {
    const startTime = Date.now();
    const defaultTag = { id: 48, name: 'other' };

    // Get total count for logging
    const totalPostsResult = await this.postEntity.query(
      'SELECT COUNT(*) as count FROM posts',
    );
    const totalPosts = parseInt(totalPostsResult[0]?.count || '0', 10);
    console.log(`[updatePostsSuggestedTagsBatch] Total posts in database: ${totalPosts}`);

    // Get all posts
    const allPostsRaw = await this.postEntity.query(`
      SELECT id, generation_params 
      FROM posts
    `);

    // Transform raw results
    const allPosts = allPostsRaw.map((post: any) => ({
      id: post.id,
      generation_params: post.generation_params,
    }));

    let processed = 0;
    let updated = 0;
    let skipped = 0;
    const total = allPosts.length;

    console.log(`[updatePostsSuggestedTagsBatch] Retrieved ${total} posts from database`);
    
    if (total !== totalPosts) {
      console.warn(`[updatePostsSuggestedTagsBatch] ⚠️ WARNING: Retrieved ${total} posts but database has ${totalPosts} posts!`);
    } else {
      console.log(`[updatePostsSuggestedTagsBatch] ✅ Successfully retrieved all ${total} posts`);
    }

    // Process posts in batches
    const totalBatches = Math.ceil(total / batchSize);
    for (let i = 0; i < allPosts.length; i += batchSize) {
      const batchNumber = Math.floor(i / batchSize) + 1;
      const batch = allPosts.slice(i, i + batchSize);
      
      console.log(`[updatePostsSuggestedTagsBatch] Processing batch ${batchNumber}/${totalBatches} (${batch.length} posts)...`);
      
      // Process batch - only update posts missing suggestedTags
      for (const post of batch) {
        try {
          // Check if suggestedTags already exists
          let existingParams = post.generation_params;
          if (!existingParams || typeof existingParams !== 'object') {
            existingParams = {};
          }

          // Skip if suggestedTags already exists and is not empty
          if (
            existingParams.suggestedTags &&
            Array.isArray(existingParams.suggestedTags) &&
            existingParams.suggestedTags.length > 0
          ) {
            skipped++;
            processed++;
            continue;
          }

          // Add default suggestedTags only if missing
          const updatedParams = {
            ...existingParams,
            suggestedTags: [defaultTag],
          };

          await this.postEntity.update(
            { id: post.id },
            { generation_params: updatedParams },
          );
          updated++;
          processed++;
        } catch (error) {
          console.error(`[updatePostsSuggestedTagsBatch] Failed to process post ${post.id}:`, error?.message || error);
          processed++;
        }
      }

      // Log progress after each batch
      const progress = ((processed / total) * 100).toFixed(2);
      console.log(`[updatePostsSuggestedTagsBatch] Batch ${batchNumber}/${totalBatches} completed. Progress: ${progress}% (${processed}/${total}) | Updated: ${updated} | Skipped: ${skipped}`);

      // No delay between batches - process as fast as possible
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`[updatePostsSuggestedTagsBatch] ✅ All batches completed! Processing finished.`);
    console.log(`[updatePostsSuggestedTagsBatch] ==========================================`);
    console.log(`[updatePostsSuggestedTagsBatch] Final Statistics:`);
    console.log(`[updatePostsSuggestedTagsBatch] Total posts: ${total}`);
    console.log(`[updatePostsSuggestedTagsBatch] Processed: ${processed}`);
    console.log(`[updatePostsSuggestedTagsBatch] Updated: ${updated}`);
    console.log(`[updatePostsSuggestedTagsBatch] Skipped: ${skipped}`);
    console.log(`[updatePostsSuggestedTagsBatch] Duration: ${duration}s`);
    console.log(`[updatePostsSuggestedTagsBatch] ==========================================`);
  }

  private generateCloudinaryPreviewUrl(videoUrl: string): string | null {
    try {
      // Check if URL is from Cloudinary
      if (!videoUrl.includes('cloudinary.com')) {
        return null;
      }

      // Replace video extension with jpg for preview
      // Example: https://res.cloudinary.com/account/video/upload/v123/video.mp4
      // Becomes: https://res.cloudinary.com/account/video/upload/v123/video.jpg
      const previewUrl = videoUrl.replace(/\.(mp4|webm|mov|avi)$/i, '.jpg');
      
      return previewUrl;
    } catch (error) {
      console.warn(`[generateCloudinaryPreviewUrl] Failed to generate preview URL from ${videoUrl}:`, error?.message || error);
      return null;
    }
  }

  async updateVideoPreviewsAndTagsBatch(
    batchSize: number = 10,
    delayBetweenBatches: number = 100,
  ): Promise<{ message: string; total: number }> {
    // No delays - process as fast as possible
    const delayBetweenBatchesMs = 0;
    const delayBetweenPostsMs = 0;
    
    // Get total count first to return immediately
    const countResult = await this.postEntity.query(
      'SELECT COUNT(*) as count FROM posts WHERE videoUrl IS NOT NULL AND LENGTH(videoUrl) > 0',
    );
    const totalCount = parseInt(countResult[0]?.count || '0', 10);
    
    console.log(`[updateVideoPreviewsAndTagsBatch] Starting background batch processing...`);
    console.log(`[updateVideoPreviewsAndTagsBatch] Total video posts to process: ${totalCount}`);
    console.log(`[updateVideoPreviewsAndTagsBatch] Batch size: ${batchSize}`);
    console.log(`[updateVideoPreviewsAndTagsBatch] Delay between batches: ${delayBetweenBatchesMs}ms (fixed)`);
    console.log(`[updateVideoPreviewsAndTagsBatch] Delay between posts: ${delayBetweenPostsMs}ms (fixed)`);

    // Start processing in background (don't await)
    this.processVideoPreviewsAndTagsInBackground(batchSize, delayBetweenBatchesMs, delayBetweenPostsMs).catch((error) => {
      console.error(`[updateVideoPreviewsAndTagsBatch] Background processing error:`, error);
    });

    // Return immediately
    return {
      message: 'Batch processing started in background. Check logs for progress.',
      total: totalCount,
    };
  }

  private async processVideoPreviewsAndTagsInBackground(
    batchSize: number,
    delayBetweenBatchesMs: number,
    delayBetweenPostsMs: number,
  ): Promise<void> {
    const startTime = Date.now();
    const defaultTag = { id: 48, name: 'other' };

    // Get total count for logging
    const totalPostsResult = await this.postEntity.query(
      'SELECT COUNT(*) as count FROM posts WHERE videoUrl IS NOT NULL AND LENGTH(videoUrl) > 0',
    );
    const totalPosts = parseInt(totalPostsResult[0]?.count || '0', 10);
    console.log(`[updateVideoPreviewsAndTagsBatch] Total video posts in database: ${totalPosts}`);

    // Get all video posts
    const allPostsRaw = await this.postEntity.query(`
      SELECT id, videoUrl, previewImageUrl, generation_params 
      FROM posts 
      WHERE videoUrl IS NOT NULL AND LENGTH(videoUrl) > 0
    `);

    // Transform raw results
    const allPosts = allPostsRaw.map((post: any) => ({
      id: post.id,
      videoUrl: post.videoUrl,
      previewImageUrl: post.previewImageUrl,
      generation_params: post.generation_params,
    }));

    let processed = 0;
    let previewUpdated = 0;
    let tagsUpdated = 0;
    let skipped = 0;
    let failed = 0;
    const total = allPosts.length;

    console.log(`[updateVideoPreviewsAndTagsBatch] Retrieved ${total} video posts from database`);
    
    if (total !== totalPosts) {
      console.warn(`[updateVideoPreviewsAndTagsBatch] ⚠️ WARNING: Retrieved ${total} posts but database has ${totalPosts} posts!`);
    } else {
      console.log(`[updateVideoPreviewsAndTagsBatch] ✅ Successfully retrieved all ${total} video posts`);
    }

    // Process posts in batches
    const totalBatches = Math.ceil(total / batchSize);
    for (let i = 0; i < allPosts.length; i += batchSize) {
      const batchNumber = Math.floor(i / batchSize) + 1;
      const batch = allPosts.slice(i, i + batchSize);
      
      console.log(`[updateVideoPreviewsAndTagsBatch] Processing batch ${batchNumber}/${totalBatches} (${batch.length} posts)...`);
      
      // Process batch - update previewImageUrl and suggestedTags
      for (const post of batch) {
        try {
          let needsUpdate = false;
          let updatedPreviewImageUrl = post.previewImageUrl;
          let updatedGenerationParams = post.generation_params;

          // Handle generation_params
          if (!updatedGenerationParams || typeof updatedGenerationParams !== 'object') {
            updatedGenerationParams = {};
          }

          // Check and update previewImageUrl if missing
          if (!post.previewImageUrl || post.previewImageUrl.trim() === '') {
            const previewUrl = this.generateCloudinaryPreviewUrl(post.videoUrl);
            if (previewUrl) {
              updatedPreviewImageUrl = previewUrl;
              needsUpdate = true;
              previewUpdated++;
            } else {
              console.warn(`[updateVideoPreviewsAndTagsBatch] Could not generate preview URL for post ${post.id} with videoUrl: ${post.videoUrl}`);
            }
          }

          // Check and update suggestedTags if missing
          if (
            !updatedGenerationParams.suggestedTags ||
            !Array.isArray(updatedGenerationParams.suggestedTags) ||
            updatedGenerationParams.suggestedTags.length === 0
          ) {
            updatedGenerationParams = {
              ...updatedGenerationParams,
              suggestedTags: [defaultTag],
            };
            needsUpdate = true;
            tagsUpdated++;
          }

          // Update post if needed
          if (needsUpdate) {
            const updateData: any = {};
            
            if (updatedPreviewImageUrl !== post.previewImageUrl) {
              updateData.previewImageUrl = updatedPreviewImageUrl;
            }
            
            if (JSON.stringify(updatedGenerationParams) !== JSON.stringify(post.generation_params)) {
              updateData.generation_params = updatedGenerationParams;
            }

            if (Object.keys(updateData).length > 0) {
              await this.postEntity.update(
                { id: post.id },
                updateData,
              );
            }
          } else {
            skipped++;
          }

          processed++;
        } catch (error) {
          console.error(`[updateVideoPreviewsAndTagsBatch] Failed to process post ${post.id}:`, error?.message || error);
          failed++;
          processed++;
        }
      }

      // Log progress after each batch
      const progress = ((processed / total) * 100).toFixed(2);
      console.log(`[updateVideoPreviewsAndTagsBatch] Batch ${batchNumber}/${totalBatches} completed. Progress: ${progress}% (${processed}/${total}) | Preview Updated: ${previewUpdated} | Tags Updated: ${tagsUpdated} | Skipped: ${skipped} | Failed: ${failed}`);

      // No delay between batches - process as fast as possible
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`[updateVideoPreviewsAndTagsBatch] ✅ All batches completed! Processing finished.`);
    console.log(`[updateVideoPreviewsAndTagsBatch] ==========================================`);
    console.log(`[updateVideoPreviewsAndTagsBatch] Final Statistics:`);
    console.log(`[updateVideoPreviewsAndTagsBatch] Total video posts: ${total}`);
    console.log(`[updateVideoPreviewsAndTagsBatch] Processed: ${processed}`);
    console.log(`[updateVideoPreviewsAndTagsBatch] Preview ImageUrl Updated: ${previewUpdated}`);
    console.log(`[updateVideoPreviewsAndTagsBatch] SuggestedTags Updated: ${tagsUpdated}`);
    console.log(`[updateVideoPreviewsAndTagsBatch] Skipped: ${skipped}`);
    console.log(`[updateVideoPreviewsAndTagsBatch] Failed: ${failed}`);
    console.log(`[updateVideoPreviewsAndTagsBatch] Duration: ${duration}s`);
    console.log(`[updateVideoPreviewsAndTagsBatch] ==========================================`);
  }

  async blockPost(post_id: number) {
    const post = await this.postEntity.findOne({ where: { id: post_id } });
    if (!post) throw new NotFoundException('Post not found');

    post.is_blocked = true;
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

    await this.activityService.createActivities(
      userId,
      [post.user.id],
      ActivityEnum.ADMIN_REPORT,
      undefined,
      true,
      undefined,
      post,
    );
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
      .orderBy('reportedUser.is_deleted', 'ASC')
      .addOrderBy('post.is_blocked', 'ASC')
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
        is_user_blocked: report.reportedUser.is_deleted,
        is_post_blocked: report.post.is_blocked,
      })),
      total,
      page,
      limit,
    };
  }
  async unblockPost(post_id: number) {
    const post = await this.postEntity.findOne({
      where: { id: post_id, is_blocked: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    post.is_blocked = false;
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
      where: { id: user_id, is_deleted: false },
    });
    if (!user) throw new NotFoundException('User not found');

    user.is_deleted = true;
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
      isPublished: post.is_published,
      isBlocked: post.is_blocked,
      isRejected: post.is_rejected,
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
    await this.activityService.createActivities(
      null,
      admins.map((e) => e.id),
      ActivityEnum.ADMIN_REPORT_REVIEW,
      undefined,
      true,
      undefined,
      report.post,
    );

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
