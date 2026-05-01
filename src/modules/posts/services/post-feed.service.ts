import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PostEntity } from '../entities/post.entity';
import { PopularPostsResponse } from '../types/popular-post.interface';

@Injectable()
export class PostFeedService {
  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
  ) {}

  async getPosts(
    cursor: number | null,
    limit: number,
    userId: number,
    tagId: number | null = null,
  ) {
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
        ${tagCondition}
        ${cursorCondition}
      ORDER BY
        p.id DESC
      LIMIT ${safeLimit};
    `;

    const posts = await this.postRepository.query(query);
    const nextCursor = posts.length > 0 ? posts[posts.length - 1].id : null;

    const normalizedPosts = posts.map((post) => ({
      ...post,
      hasAudio: Boolean(post.hasAudio),
      generationParams: this.normalizeGenerationParams(
        this.parseGenerationParams(post.generationParams),
      ),
    }));

    return {
      data: normalizedPosts,
      nextCursor,
      hasNextPage: posts.length === safeLimit,
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
        p.isPublished AS isPublished,
        p.hasAudio AS hasAudio
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
      this.postRepository.query(postsQuery, [tagId, limit, offset]),
      this.postRepository.query(totalQuery, [tagId]),
    ]);

    const total = parseInt(totalResult[0]?.total || '0', 10);

    const normalizedPosts = posts.map((post) => ({
      ...post,
      hasAudio: Boolean(post.hasAudio),
      generationParams: this.normalizeGenerationParams(
        this.parseGenerationParams(post.generationParams),
      ),
    }));

    return {
      data: normalizedPosts,
      total,
      page,
      limit,
    };
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
      this.postRepository.query(query, [userId, safeLimit, offset]),
      this.postRepository.query(totalQuery, [userId]),
    ]);

    const total = parseInt(totalResult[0]?.total || '0', 10);
    const totalPages = Math.ceil(total / safeLimit) || 1;

    const data = posts.map((post) => ({
      ...post,
      hasAudio: Boolean(post.hasAudio),
      generationParams: this.normalizeGenerationParams(
        this.parseGenerationParams(post.generationParams),
      ),
    }));

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
      this.postRepository.query(query, [userId, userId, userId, safeLimit, offset]),
      this.postRepository.query(totalQuery, [userId]),
    ]);

    const total = parseInt(totalResult[0]?.total || '0', 10);
    const totalPages = Math.ceil(total / safeLimit) || 1;

    const data = posts.map((post) => ({
      ...post,
      hasAudio: Boolean(post.hasAudio),
      generationParams: this.normalizeGenerationParams(
        this.parseGenerationParams(post.generationParams),
      ),
    }));

    return {
      data,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages,
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

      const allFoundPosts = [];
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
          p.generationParams AS generationParams,
          p.hasAudio AS hasAudio
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
            p.generationParams AS generationParams,
            p.hasAudio AS hasAudio
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
            p.generationParams AS generationParams,
            p.hasAudio AS hasAudio
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
        hasAudio: Boolean(item.post.hasAudio),
        isBlocked: item.post.isBlocked || false,
        isRejected: item.post.isRejected || false,
        isLiked: item.post.isLiked,
        isViewed: item.post.isViewed,
        generationParams:
          this.normalizeGenerationParams(
            this.parseGenerationParams(item.post.generationParams),
          ) || null,
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

  private parseGenerationParams(params: any): any {
    if (typeof params !== 'string') {
      return params;
    }

    try {
      return JSON.parse(params);
    } catch {
      return null;
    }
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
      ai_service: params.ai_service || params.aiService || 'flux',
      orientation: params.orientation || 'vertical',
      style_id: params.style_id,
      color_id: params.color_id,
      width: params.width,
      height: params.height,
      negative_prompt: params.negative_prompt || params.negativePrompt,
    };
  }
}
