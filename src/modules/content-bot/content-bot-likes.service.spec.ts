import { BadRequestException } from '@nestjs/common';
import { ContentBotService } from './content-bot.service';

/**
 * The bot likes through the SAME LikeService a user's like goes through, so the
 * risky parts are not the like itself but the tick around it:
 *  1. off unless CONTENT_BOT_LIKES_ENABLED is flipped on;
 *  2. the batch is bounded per tick (no daily cap by design);
 *  3. selection excludes own posts, invisible posts and already-liked posts;
 *  4. an expected rejection (duplicate / own post) never kills the tick, while
 *     running out of points stops it immediately;
 *  5. no pointless LIKE_SPEND push to the bot itself;
 *  6. posts predating the feature's start are never liked.
 */
describe('ContentBotService.likeRecentPosts', () => {
  const BOT_ID = 42;

  const makeService = ({
    settings = {} as Record<string, string | number | boolean>,
    candidateRows = [{ postId: 1 }, { postId: 2 }] as any[],
    createLike = jest.fn(async () => 'success'),
  } = {}) => {
    const value = (key: string, fallback?: any) =>
      key in settings ? settings[key] : fallback;

    const planRepository = { find: jest.fn(async () => []), query: jest.fn() };
    // jest.Mock (not the inferred zero-arg type) so mock.calls stays indexable.
    const postRepository: { query: jest.Mock } = {
      query: jest.fn(async () => candidateRows),
    };
    const tagRepository = { find: jest.fn(async () => []) };
    const userRepository = {
      findOne: jest.fn(async () => ({ id: BOT_ID, points: 2_000_000 })),
      update: jest.fn(async () => ({ affected: 0 })),
      increment: jest.fn(async () => ({})),
    };
    const chargeRepository = { findOne: jest.fn(async () => null) };
    const providerRuntimeConfigService = {
      getBoolean: jest.fn(async (key: string, fallback: boolean) =>
        Boolean(value(key, fallback)),
      ),
      getNumber: jest.fn(async (key: string, fallback?: number) =>
        Number(value(key, fallback)),
      ),
      getString: jest.fn(async (key: string) => value(key, null)),
      updateSetting: jest.fn(async () => ({})) as jest.Mock,
    };
    const likeService = { createLike };

    const service = new ContentBotService(
      planRepository as any,
      postRepository as any,
      tagRepository as any,
      userRepository as any,
      chargeRepository as any,
      providerRuntimeConfigService as any,
      {} as any,
      {} as any,
      {} as any,
      likeService as any,
    );

    return {
      service,
      postRepository,
      userRepository,
      providerRuntimeConfigService,
      likeService,
    };
  };

  const enabled = (extra: Record<string, any> = {}) => ({
    CONTENT_BOT_LIKES_ENABLED: true,
    CONTENT_BOT_USER_ID: BOT_ID,
    ...extra,
  });

  it('does nothing while CONTENT_BOT_LIKES_ENABLED is off (the default)', async () => {
    const { service, likeService, postRepository } = makeService({
      settings: { CONTENT_BOT_USER_ID: BOT_ID },
    });

    const res = await service.likeRecentPosts();

    expect(res).toEqual({
      liked: 0,
      skipped: 0,
      failed: 0,
      reason: 'likes disabled',
    });
    expect(postRepository.query).not.toHaveBeenCalled();
    expect(likeService.createLike).not.toHaveBeenCalled();
  });

  it('likes each candidate once through LikeService as the bot user', async () => {
    const { service, likeService } = makeService({
      settings: enabled(),
      candidateRows: [{ postId: 7 }, { postId: 8 }],
    });

    const res = await service.likeRecentPosts();

    expect(res.liked).toBe(2);
    expect(likeService.createLike).toHaveBeenCalledTimes(2);
    expect(likeService.createLike).toHaveBeenNthCalledWith(
      1,
      { postId: 7 },
      BOT_ID,
    );
    expect(likeService.createLike).toHaveBeenNthCalledWith(
      2,
      { postId: 8 },
      BOT_ID,
    );
  });

  it('bounds the batch per tick and clamps an absurd setting', async () => {
    const { service, postRepository } = makeService({
      settings: enabled({ CONTENT_BOT_LIKES_PER_TICK: 5 }),
    });
    await service.likeRecentPosts();
    expect(postRepository.query.mock.calls[0][0]).toContain('LIMIT 5');

    const huge = makeService({
      settings: enabled({ CONTENT_BOT_LIKES_PER_TICK: 100000 }),
    });
    await huge.service.likeRecentPosts();
    expect(huge.postRepository.query.mock.calls[0][0]).toContain('LIMIT 200');
  });

  it('selects only visible posts by other users the bot has not liked', async () => {
    const { service, postRepository } = makeService({ settings: enabled() });

    await service.likeRecentPosts();

    const [sql, params] = postRepository.query.mock.calls[0] as [string, any[]];
    expect(sql).toContain('p.isPublished = 1');
    expect(sql).toContain('p.isBlocked = 0');
    expect(sql).toContain('p.isRejected = 0');
    expect(sql).toContain('p.userId <> ?'); // never the bot's own posts
    expect(sql).toContain('bot_like.id IS NULL'); // never an already-liked post
    // Spread the love: authors with fewer bot likes in the window come first.
    expect(sql).toContain('ORDER BY COALESCE(spread.botLikes, 0) ASC');
    expect(params[0]).toBe(BOT_ID);
    expect(params[3]).toBe(BOT_ID);
  });

  it('skips an expected rejection and keeps liking the rest', async () => {
    const createLike = jest
      .fn()
      .mockRejectedValueOnce(
        new BadRequestException('You have already liked this post'),
      )
      .mockResolvedValueOnce('success');
    const { service } = makeService({
      settings: enabled(),
      candidateRows: [{ postId: 1 }, { postId: 2 }],
      createLike,
    });

    const res = await service.likeRecentPosts();

    expect(res).toMatchObject({ liked: 1, skipped: 1, failed: 0 });
    expect(createLike).toHaveBeenCalledTimes(2);
  });

  it('counts an unexpected failure without aborting the tick', async () => {
    const createLike = jest
      .fn()
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValueOnce('success');
    const { service } = makeService({
      settings: enabled(),
      candidateRows: [{ postId: 1 }, { postId: 2 }],
      createLike,
    });

    const res = await service.likeRecentPosts();

    expect(res).toMatchObject({ liked: 1, skipped: 0, failed: 1 });
  });

  it('stops the tick when the bot runs out of points', async () => {
    const createLike = jest
      .fn()
      .mockRejectedValue(
        new BadRequestException('User does not have enough points'),
      );
    const { service } = makeService({
      settings: enabled(),
      candidateRows: [{ postId: 1 }, { postId: 2 }, { postId: 3 }],
      createLike,
    });

    const res = await service.likeRecentPosts();

    expect(res.reason).toBe('bot out of points');
    expect(createLike).toHaveBeenCalledTimes(1); // no 50 identical failures
  });

  it('keeps the bot solvent by topping up before the batch', async () => {
    const { service, userRepository } = makeService({ settings: enabled() });
    userRepository.findOne.mockResolvedValue({
      id: BOT_ID,
      points: 100,
    } as any);

    await service.likeRecentPosts();

    expect(userRepository.increment).toHaveBeenCalledWith(
      { id: BOT_ID },
      'points',
      expect.any(Number),
    );
  });

  it('suppresses the LIKE_SPEND push to the bot itself', async () => {
    const { service, userRepository } = makeService({ settings: enabled() });

    await service.likeRecentPosts();

    expect(userRepository.update).toHaveBeenCalledWith(
      { id: BOT_ID, notificationsEnabled: true },
      { notificationsEnabled: false },
    );
  });

  it('stamps the start timestamp once and never likes pre-feature posts', async () => {
    const fresh = makeService({ settings: enabled() });
    await fresh.service.likeRecentPosts();

    const persisted =
      fresh.providerRuntimeConfigService.updateSetting.mock.calls[0];
    expect(persisted[0]).toBe('CONTENT_BOT_LIKES_START_AT');

    // A stored start newer than the age window wins, so widening the age
    // setting cannot backfill older posts.
    const startedAt = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
    const later = makeService({
      settings: enabled({
        CONTENT_BOT_LIKES_START_AT: startedAt.toISOString(),
        CONTENT_BOT_LIKE_MAX_POST_AGE_HOURS: 720,
      }),
    });
    await later.service.likeRecentPosts();

    expect(
      later.providerRuntimeConfigService.updateSetting,
    ).not.toHaveBeenCalled();
    const since: Date = later.postRepository.query.mock.calls[0][1][4];
    expect(since.getTime()).toBe(startedAt.getTime());
  });
});
