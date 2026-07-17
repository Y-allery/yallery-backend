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

    // Query order in all-tags mode: backbone page, the user's tag ids, the
    // per-tag spotlight UNION, then the INSERT IGNORE that marks spotlight
    // posts viewed.
    const mockAllTags = (
      postRepository: any,
      backbone: any[],
      tagIds: number[],
      spotlight: any[],
    ) => {
      postRepository.query
        .mockResolvedValueOnce(backbone)
        .mockResolvedValueOnce(tagIds.map((tagsId) => ({ tagsId })))
        .mockResolvedValueOnce(spotlight)
        .mockResolvedValueOnce({});
    };

    it('gives half the page to other tags even when they are buried below the flood', async () => {
      const { service, postRepository } = createService();
      // The backbone is all tag 1 (a contest flood); tags 2-4 are far deeper
      // in the id order than any window could reach.
      mockAllTags(
        postRepository,
        Array.from({ length: 6 }, (_, i) => feedRow(1000 - i, 1)),
        [1, 2, 3, 4],
        [feedRow(400, 2), feedRow(300, 3), feedRow(200, 4)],
      );

      const result = await service.getPosts(null, 6, 55, null);

      expect(result.data.map((post) => post.tagId)).toEqual([1, 2, 1, 3, 1, 4]);
      expect(result.data.map((post) => post.id)).toEqual([
        1000, 400, 999, 300, 998, 200,
      ]);
      // Cursor advances only over the three backbone posts served, so nothing
      // between 998 and 400 is skipped — it is still ahead of the next page.
      expect(result.nextCursor).toBe(998);
      expect(result.hasNextPage).toBe(true);
    });

    it('marks spotlight posts viewed so the next page cannot repeat them', async () => {
      const { service, postRepository } = createService();
      mockAllTags(
        postRepository,
        Array.from({ length: 6 }, (_, i) => feedRow(1000 - i, 1)),
        [1, 2, 3],
        [feedRow(400, 2), feedRow(300, 3)],
      );

      await service.getPosts(null, 6, 55, null);

      const [sql, params] = postRepository.query.mock.calls[3];
      expect(sql).toContain('INSERT IGNORE INTO viewed_posts');
      expect(params).toEqual([55, 400, 55, 300]);
    });

    it('holds the cursor and keeps serving spotlight posts once the backbone runs out', async () => {
      const { service, postRepository } = createService();
      mockAllTags(postRepository, [], [1, 2], [feedRow(400, 2)]);

      const result = await service.getPosts(900, 6, 55, null);

      expect(result.data.map((post) => post.id)).toEqual([400]);
      // No backbone post was served, so the cursor cannot move; the spotlight
      // still advances because each post is marked viewed as it is served.
      expect(result.nextCursor).toBe(900);
    });

    it('falls back to a plain chronological page when no other tag has content', async () => {
      const { service, postRepository } = createService();
      mockAllTags(
        postRepository,
        Array.from({ length: 6 }, (_, i) => feedRow(1000 - i, 1)),
        [1],
        [],
      );

      const result = await service.getPosts(null, 6, 55, null);

      expect(result.data.map((post) => post.id)).toEqual([
        1000, 999, 998, 997, 996, 995,
      ]);
      expect(result.nextCursor).toBe(995);
      // Backbone + tag lookup only: with no other tag to pull from there is no
      // spotlight UNION and nothing to mark viewed.
      expect(postRepository.query).toHaveBeenCalledTimes(2);
    });

    it('keeps the single-tag feed on the plain chronological path', async () => {
      const { service, postRepository } = createService();
      postRepository.query.mockResolvedValueOnce([
        feedRow(10, 7),
        feedRow(9, 7),
      ]);

      const result = await service.getPosts(null, 6, 55, 7);

      // One query only: no spotlight, no viewed-marking.
      expect(postRepository.query).toHaveBeenCalledTimes(1);
      const params = postRepository.query.mock.calls[0][1];
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
