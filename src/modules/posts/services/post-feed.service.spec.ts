import { PostFeedService } from './post-feed.service';

describe('PostFeedService', () => {
  const createService = () => {
    const postRepository = {
      query: jest.fn(),
    };

    return {
      service: new PostFeedService(postRepository as any),
      postRepository,
    };
  };

  const postRow = {
    id: 1,
    imageUrl: 'https://cdn.test/image.png',
    videoUrl: null,
    previewImageUrl: null,
    createdAt: new Date(),
    userId: 55,
    username: 'demo',
    tagId: 1,
    tagName: '#demo',
    likeCount: 0,
    viewCount: 0,
    isLiked: false,
    isViewed: false,
    isPublished: true,
    hasAudio: false,
    generationParams: JSON.stringify({
      prompt: 'demo prompt',
      ai_service: 'flux2_klein',
      orientation: 'vertical',
      width: 768,
      height: 1344,
      suggestedTags: [{ id: 1, name: '#demo' }],
    }),
  };

  describe('getPosts all-tags diversification', () => {
    const feedRow = (id: number, tagId: number) => ({
      ...postRow,
      id,
      tagId,
      tagName: `#tag${tagId}`,
    });

    it('interleaves tags round-robin over a full window so a flooding tag cannot own the page', async () => {
      const { service, postRepository } = createService();
      // Full window (24 = 4x the page): a contest tag (1) floods the fresh end
      // while tags 2 and 3 sit deeper. This is the case the feature exists for.
      const window = [
        ...Array.from({ length: 10 }, (_, i) => feedRow(100 - i, 1)),
        feedRow(90, 2),
        ...Array.from({ length: 12 }, (_, i) => feedRow(89 - i, 1)),
        feedRow(77, 3),
      ];
      expect(window).toHaveLength(24);
      postRepository.query.mockResolvedValueOnce(window);

      const result = await service.getPosts(null, 6, 55, null);

      // Window overfetch: LIMIT param is 4x the requested page size.
      const params = postRepository.query.mock.calls[0][1];
      expect(params[params.length - 1]).toBe(24);

      // One post per tag per cycle: both minority tags reach page one even
      // though they are buried 11 and 24 rows deep.
      expect(result.data.map((post) => post.tagId)).toEqual([1, 2, 3, 1, 1, 1]);
      expect(result.data.map((post) => post.id)).toEqual([
        100, 90, 77, 99, 98, 97,
      ]);

      // nextCursor must be the minimum id of the returned page, not the last
      // element (the app paginates with p.id < cursor and never dedupes).
      expect(result.nextCursor).toBe(77);
      expect(result.hasNextPage).toBe(true);
    });

    it('mixes only within the page when the window is short, so no fresh post is stranded', async () => {
      const { service, postRepository } = createService();
      // Short window (20 < 24) = this is everything the user has left. Pulling
      // the id-50 post up would set the cursor to 50 and hide the 14 fresh
      // posts above it with no page below to recover them.
      const window = [
        ...Array.from({ length: 19 }, (_, i) => feedRow(100 - i, 1)),
        feedRow(50, 2),
      ];
      postRepository.query.mockResolvedValueOnce(window);

      const result = await service.getPosts(null, 6, 55, null);

      // Cursor stays at the chronological page boundary: nothing skipped.
      expect(result.data.map((post) => post.id)).toEqual([
        100, 99, 98, 97, 96, 95,
      ]);
      expect(result.nextCursor).toBe(95);
      expect(result.hasNextPage).toBe(true);
    });

    it('still spreads tags within the page on a short window', async () => {
      const { service, postRepository } = createService();
      // Short window, but the page itself holds two tags: chronologically it
      // would read 1,1,1,1,2,2 — interleaving alternates them instead, and
      // still returns the same six posts (cursor unmoved, nothing skipped).
      const window = [
        feedRow(100, 1),
        feedRow(99, 1),
        feedRow(98, 1),
        feedRow(97, 1),
        feedRow(96, 2),
        feedRow(95, 2),
        feedRow(94, 1),
      ];
      postRepository.query.mockResolvedValueOnce(window);

      const result = await service.getPosts(null, 6, 55, null);

      expect(result.data.map((post) => post.tagId)).toEqual([1, 2, 1, 2, 1, 1]);
      expect(result.data.map((post) => post.id)).toEqual([
        100, 96, 99, 95, 98, 97,
      ]);
      expect(result.nextCursor).toBe(95);
    });

    it('keeps single-tag feeds and short windows unchanged', async () => {
      const { service, postRepository } = createService();
      postRepository.query.mockResolvedValueOnce([
        feedRow(10, 7),
        feedRow(9, 7),
      ]);

      const result = await service.getPosts(null, 6, 55, 7);

      const params = postRepository.query.mock.calls[0][1];
      // Tag-filtered feed fetches exactly the page size (no window).
      expect(params[params.length - 1]).toBe(6);
      expect(result.data.map((post) => post.id)).toEqual([10, 9]);
      expect(result.nextCursor).toBe(9);
      expect(result.hasNextPage).toBe(false);
    });
  });

  it('does not expose suggestedTags in normalized generation params', () => {
    const { service } = createService();

    const normalized = (service as any).normalizeGenerationParams(
      JSON.parse(postRow.generationParams),
    );

    expect(normalized).toMatchObject({
      prompt: 'demo prompt',
      ai_service: 'flux2_klein',
      orientation: 'vertical',
      width: 768,
      height: 1344,
    });
    expect(normalized).not.toHaveProperty('suggestedTags');
  });

  it('does not expose top-level suggestedTags in published posts', async () => {
    const { service, postRepository } = createService();
    postRepository.query
      .mockResolvedValueOnce([{ ...postRow, hasAudio: 1 }])
      .mockResolvedValueOnce([{ total: '1' }]);

    const result = await service.getPublishedPosts(55);

    expect(result.data[0].hasAudio).toBe(true);
    expect(result.data[0]).not.toHaveProperty('suggestedTags');
    expect(result.data[0].generationParams).not.toHaveProperty('suggestedTags');
  });

  it('does not expose top-level suggestedTags in unpublished posts', async () => {
    const { service, postRepository } = createService();
    postRepository.query
      .mockResolvedValueOnce([{ ...postRow, isPublished: false }])
      .mockResolvedValueOnce([{ total: '1' }]);

    const result = await service.getUnpublishedPosts(55);

    expect(result.data[0]).not.toHaveProperty('suggestedTags');
    expect(result.data[0].generationParams).not.toHaveProperty('suggestedTags');
  });

  it('returns hasAudio in popular posts', async () => {
    const { service, postRepository } = createService();
    postRepository.query
      .mockResolvedValueOnce(
        Array.from({ length: 6 }, (_, index) => ({
          ...postRow,
          id: index + 1,
          hasAudio: true,
          periodBucket: 0,
        })),
      )
      // per-user isLiked / isViewed flag lookups
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.getPopularPosts(55);

    expect(result.posts[0].hasAudio).toBe(true);
    expect(result.posts[0]).not.toHaveProperty('suggestedTags');
    expect(result.posts[0].generationParams).not.toHaveProperty('suggestedTags');
  });
});
