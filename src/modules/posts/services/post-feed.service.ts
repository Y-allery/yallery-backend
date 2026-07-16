import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PostEntity } from '../entities/post.entity';
import {
  PopularPost,
  PopularPostsResponse,
} from '../types/popular-post.interface';

interface PopularCoreRow {
  id: number;
  imageUrl: string | null;
  videoUrl: string | null;
  previewImageUrl: string | null;
  createdAt: Date;
  userId: number;
  username: string | null;
  tagId: number | null;
  tagName: string | null;
  isPublished: boolean;
  isBlocked: boolean;
  isRejected: boolean;
  likeCount: number;
  viewCount: number;
  generationParams: unknown;
  hasAudio: boolean;
  periodBucket: number;
}

@Injectable()
export class PostFeedService {
  // Popular posts are identical for all users except isLiked/isViewed flags,
  // so the heavy aggregate query is cached and flags are resolved per request.
  private popularPostsCache: { rows: PopularCoreRow[]; expiresAt: number } | null =
    null;
  private static readonly POPULAR_POSTS_CACHE_TTL_MS = 60_000;

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

    const conditions: string[] = [];
    const params: (number | string)[] = [userId, userId, userId];

    if (tagId) {
      conditions.push('AND p.tagId = ?');
      params.push(tagId);
    }
    if (cursor) {
      conditions.push('AND p.id < ?');
      params.push(cursor);
    }
    params.push(safeLimit);

    // isViewed is always false here: the NOT EXISTS filter excludes viewed posts.
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
        CONCAT('#', t.name) AS tagName,
        (SELECT COUNT(*) FROM likes l WHERE l.postId = p.id) AS likeCount,
        (SELECT COUNT(*) FROM viewed_posts v WHERE v.postId = p.id) AS viewCount,
        EXISTS (SELECT 1 FROM likes l WHERE l.postId = p.id AND l.userId = ?) AS isLiked,
        FALSE AS isViewed,
        p.generationParams AS generationParams,
        p.isPublished AS isPublished,
        p.hasAudio AS hasAudio
      FROM
        posts p
        JOIN users u ON u.id = p.userId
        JOIN tags t ON t.id = p.tagId
      WHERE
        p.isPublished = true
        AND p.isBlocked = false
        AND NOT EXISTS (SELECT 1 FROM viewed_posts v WHERE v.postId = p.id AND v.userId = ?)
        AND p.tagId IN (
          SELECT ut.tagsId
          FROM users_tags_tags ut
          WHERE ut.usersId = ?
        )
        ${conditions.join('\n        ')}
      ORDER BY
        p.id DESC
      LIMIT ?;
    `;

    const posts = await this.postRepository.query(query, params);
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
      SELECT
        p.id AS id,
        p.imageUrl AS imageUrl,
        p.videoUrl AS videoUrl,
        p.previewImageUrl AS previewImageUrl,
        p.createdAt AS createdAt,
        u.id AS userId,
        u.nickname AS username,
        t.id AS tagId,
        CONCAT('#', t.name) AS tagName,
        (SELECT COUNT(*) FROM likes l WHERE l.postId = p.id) AS likeCount,
        (SELECT COUNT(*) FROM viewed_posts v WHERE v.postId = p.id) AS viewCount,
        EXISTS (SELECT 1 FROM likes l WHERE l.postId = p.id AND l.userId = ?) AS isLiked,
        EXISTS (SELECT 1 FROM viewed_posts v WHERE v.postId = p.id AND v.userId = ?) AS isViewed,
        p.generationParams AS generationParams,
        p.isPublished AS isPublished,
        p.hasAudio AS hasAudio
      FROM posts p
      JOIN users u ON u.id = p.userId
      JOIN tags t ON t.id = p.tagId
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
      this.postRepository.query(postsQuery, [
        userId || 0,
        userId || 0,
        tagId,
        limit,
        offset,
      ]),
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
      const rows = await this.getPopularPostsCore();

      if (rows.length === 0) {
        return { posts: [], period: 'all_time', totalCount: 0 };
      }

      const ids = rows.map((row) => row.id);
      const placeholders = ids.map(() => '?').join(',');

      const [likedRows, viewedRows] = await Promise.all([
        this.postRepository.query(
          `SELECT postId FROM likes WHERE userId = ? AND postId IN (${placeholders})`,
          [userId, ...ids],
        ),
        this.postRepository.query(
          `SELECT postId FROM viewed_posts WHERE userId = ? AND postId IN (${placeholders})`,
          [userId, ...ids],
        ),
      ]);

      const likedIds = new Set(likedRows.map((row) => Number(row.postId)));
      const viewedIds = new Set(viewedRows.map((row) => Number(row.postId)));

      const sortedRows = [...rows].sort((a, b) => {
        if (Number(b.likeCount) !== Number(a.likeCount)) {
          return Number(b.likeCount) - Number(a.likeCount);
        }
        return Number(b.viewCount) - Number(a.viewCount);
      });

      const posts: PopularPost[] = sortedRows.map((row) => ({
        id: row.id,
        imageUrl: row.imageUrl,
        videoUrl: row.videoUrl,
        previewImageUrl: row.previewImageUrl,
        likeCount: Number(row.likeCount) || 0,
        viewCount: Number(row.viewCount) || 0,
        createdAt: row.createdAt,
        userId: row.userId,
        username: row.username || 'Unknown User',
        tagName: row.tagName,
        tagId: row.tagId,
        isPublished: Boolean(row.isPublished),
        hasAudio: Boolean(row.hasAudio),
        isBlocked: Boolean(row.isBlocked),
        isRejected: Boolean(row.isRejected),
        isLiked: likedIds.has(row.id),
        isViewed: viewedIds.has(row.id),
        generationParams:
          this.normalizeGenerationParams(
            this.parseGenerationParams(row.generationParams),
          ) || null,
      }));

      const buckets = new Set(rows.map((row) => Number(row.periodBucket)));
      let period: PopularPostsResponse['period'];
      if (buckets.size > 1) {
        period = 'mixed';
      } else if (buckets.has(0)) {
        period = 'today';
      } else if (buckets.has(1)) {
        period = 'yesterday';
      } else {
        period = 'all_time';
      }

      return {
        posts,
        period,
        totalCount: posts.length,
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

  /**
   * Top-6 posts prioritized by recency bucket (today > yesterday > older) and
   * ranked by like/view counts. One query with pre-aggregated counts instead of
   * the previous three sequential full scans ordered by correlated subqueries.
   */
  private async getPopularPostsCore(): Promise<PopularCoreRow[]> {
    const now = Date.now();
    if (this.popularPostsCache && this.popularPostsCache.expiresAt > now) {
      return this.popularPostsCache.rows;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

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
        CONCAT('#', t.name) AS tagName,
        p.isPublished AS isPublished,
        p.isBlocked AS isBlocked,
        p.isRejected AS isRejected,
        COALESCE(lc.cnt, 0) AS likeCount,
        COALESCE(vc.cnt, 0) AS viewCount,
        p.generationParams AS generationParams,
        p.hasAudio AS hasAudio,
        CASE
          WHEN p.createdAt >= ? THEN 0
          WHEN p.createdAt >= ? THEN 1
          ELSE 2
        END AS periodBucket
      FROM posts p
      JOIN users u ON u.id = p.userId
      LEFT JOIN tags t ON t.id = p.tagId
      LEFT JOIN (SELECT postId, COUNT(*) AS cnt FROM likes GROUP BY postId) lc
        ON lc.postId = p.id
      LEFT JOIN (SELECT postId, COUNT(*) AS cnt FROM viewed_posts GROUP BY postId) vc
        ON vc.postId = p.id
      WHERE p.isPublished = true
        AND p.isBlocked = false
        AND p.isRejected = false
        AND (p.imageUrl IS NOT NULL OR p.videoUrl IS NOT NULL)
      ORDER BY periodBucket ASC, likeCount DESC, viewCount DESC
      LIMIT 6;
    `;

    const rows: PopularCoreRow[] = await this.postRepository.query(query, [
      today.toISOString(),
      yesterday.toISOString(),
    ]);

    this.popularPostsCache = {
      rows,
      expiresAt: now + PostFeedService.POPULAR_POSTS_CACHE_TTL_MS,
    };

    return rows;
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
