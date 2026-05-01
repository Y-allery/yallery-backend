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
      .mockResolvedValueOnce([postRow])
      .mockResolvedValueOnce([{ total: '1' }]);

    const result = await service.getPublishedPosts(55);

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
});
