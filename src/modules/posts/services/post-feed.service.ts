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

    const chronoRows = await this.fetchFeedRows({
      userId,
      tagId,
      cursor,
      limit: safeLimit,
    });

    if (tagId) {
      return this.buildFeedResponse(chronoRows, safeLimit, chronoRows, cursor);
    }

    // All-tags mode. A running contest buries every other tag: on a real
    // account the 120 newest feed posts were 119 contest posts and one other,
    // with the next tag's freshest post 1147 rows down — no overfetch window
    // can reach that. So the page is built from two sources instead: a
    // chronological backbone, which is the only thing the cursor advances
    // over, plus one freshest post pulled per other followed tag.
    const spotlight = await this.fetchTagSpotlight({
      userId,
      excludeTagIds: new Set<number>(
        chronoRows.map((row) => Number(row.tagId)),
      ),
      quota: Math.floor(safeLimit / 2),
    });

    if (spotlight.length === 0) {
      return this.buildFeedResponse(chronoRows, safeLimit, chronoRows, cursor);
    }

    // Spotlight posts take slots away from the backbone rather than extending
    // the page, so the cursor advances only over the backbone posts actually
    // served — nothing between them is skipped.
    const backbone = chronoRows.slice(0, safeLimit - spotlight.length);
    const page = this.interleave(backbone, spotlight);

    // Spotlight ids sit below the cursor, so the next page's `id < cursor`
    // would serve them again. Marking them viewed now is what keeps them out;
    // the app marks every served post viewed one page later anyway.
    await this.markSpotlightViewed(
      userId,
      spotlight.map((row) => Number(row.id)),
    );

    return this.buildFeedResponse(page, safeLimit, backbone, cursor);
  }

  private buildFeedResponse(
    page: any[],
    safeLimit: number,
    cursorRows: any[],
    previousCursor: number | null,
  ) {
    // The app appends pages without deduping and echoes nextCursor verbatim
    // into `p.id < cursor`, so the cursor must be the lowest id whose
    // predecessors are all accounted for — the backbone's minimum. When the
    // backbone is exhausted the cursor holds, and spotlight posts keep coming
    // because each is marked viewed as it is served.
    const nextCursor = cursorRows.length
      ? Math.min(...cursorRows.map((row) => Number(row.id)))
      : previousCursor;

    const data = page.map((post) => ({
      ...post,
      hasAudio: Boolean(post.hasAudio),
      generationParams: this.normalizeGenerationParams(
        this.parseGenerationParams(post.generationParams),
      ),
    }));

    return {
      data,
      nextCursor,
      hasNextPage: page.length === safeLimit,
    };
  }

  /** Round-robin, so a spotlight post lands between backbone posts. */
  private interleave(backbone: any[], spotlight: any[]): any[] {
    const page: any[] = [];
    const max = Math.max(backbone.length, spotlight.length);
    for (let i = 0; i < max; i++) {
      if (i < backbone.length) page.push(backbone[i]);
      if (i < spotlight.length) page.push(spotlight[i]);
    }
    return page;
  }

  private feedRowColumns(userId: number): { sql: string; params: number[] } {
    // isViewed is always false here: the NOT EXISTS filter excludes viewed posts.
    return {
      sql: `
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
        p.hasAudio AS hasAudio`,
      params: [userId],
    };
  }

  private async fetchFeedRows(args: {
    userId: number;
    tagId: number | null;
    cursor: number | null;
    limit: number;
  }): Promise<any[]> {
    const columns = this.feedRowColumns(args.userId);
    const conditions: string[] = [];
    const params: number[] = [
      ...columns.params,
      args.userId,
      args.userId,
    ];

    if (args.tagId) {
      conditions.push('AND p.tagId = ?');
      params.push(args.tagId);
    }
    if (args.cursor) {
      conditions.push('AND p.id < ?');
      params.push(args.cursor);
    }
    params.push(args.limit);

    return this.postRepository.query(
      `
      SELECT ${columns.sql}
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
      ORDER BY p.id DESC
      LIMIT ?;
      `,
      params,
    );
  }

  /**
   * The freshest unviewed post of each followed tag that the backbone does not
   * already cover, newest tags first. One bounded query per tag keeps this off
   * the flooded id ordering entirely — depth in the global feed is irrelevant.
   */
  private async fetchTagSpotlight(args: {
    userId: number;
    excludeTagIds: Set<number>;
    quota: number;
  }): Promise<any[]> {
    if (args.quota < 1) {
      return [];
    }

    const tagRows: Array<{ tagsId: number }> = await this.postRepository.query(
      'SELECT ut.tagsId AS tagsId FROM users_tags_tags ut WHERE ut.usersId = ?',
      [args.userId],
    );
    const candidateTagIds = tagRows
      .map((row) => Number(row.tagsId))
      .filter((id) => !args.excludeTagIds.has(id));

    if (candidateTagIds.length === 0) {
      return [];
    }

    const columns = this.feedRowColumns(args.userId);
    const branches = candidateTagIds.map(
      () => `
        (SELECT ${columns.sql}
         FROM posts p
           JOIN users u ON u.id = p.userId
           JOIN tags t ON t.id = p.tagId
         WHERE p.tagId = ?
           AND p.isPublished = true
           AND p.isBlocked = false
           AND NOT EXISTS (SELECT 1 FROM viewed_posts v WHERE v.postId = p.id AND v.userId = ?)
         ORDER BY p.id DESC
         LIMIT 1)`,
    );
    // Each branch binds, in order: isLiked's userId, its own tagId, then the
    // NOT EXISTS userId.
    const params = candidateTagIds.flatMap((candidateTagId) => [
      args.userId,
      candidateTagId,
      args.userId,
    ]);

    const rows: any[] = await this.postRepository.query(
      branches.join('\n        UNION ALL\n'),
      params,
    );

    return rows
      .sort((a, b) => Number(b.id) - Number(a.id))
      .slice(0, args.quota);
  }

  private async markSpotlightViewed(userId: number, postIds: number[]) {
    if (!postIds.length) {
      return;
    }
    await this.postRepository.query(
      `INSERT IGNORE INTO viewed_posts (userId, postId) VALUES ${postIds
        .map(() => '(?, ?)')
        .join(', ')}`,
      postIds.flatMap((postId) => [userId, postId]),
    );
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
