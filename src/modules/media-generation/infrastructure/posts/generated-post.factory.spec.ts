import { GeneratedPostFactory } from 'src/modules/media-generation/infrastructure/posts/generated-post.factory';

describe('GeneratedPostFactory', () => {
  const createFactory = () => {
    const postRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 123, ...value })),
    };

    return {
      factory: new GeneratedPostFactory(postRepository as any),
      postRepository,
    };
  };

  it('shapes prompt image generation params', async () => {
    const { factory } = createFactory();

    const post = await factory.createPromptImagePost(
      {
        aiService: 'sdxl_lora_generation',
        prompt: 'raw prompt',
        resolvedPrompt: 'resolved prompt',
        translatedPrompt: 'translated prompt',
        orientation: 'square',
        width: 1024,
        height: 1024,
        imageQuantity: 1,
        contestId: 10,
        providerSettings: {
          loraKey: 'demo-key',
          loraScale: 0.7,
          triggerWord: 'demo',
          loraUrl: 'https://cdn.test/lora.safetensors',
        },
      } as any,
      55,
      'https://cdn.test/image.png',
      null,
    );

    expect(post).toMatchObject({
      imageUrl: 'https://cdn.test/image.png',
      contest: { id: 10 },
      generationParams: {
        prompt: 'raw prompt',
        resolvedPrompt: 'resolved prompt',
        aiService: 'sdxl_lora_generation',
        loraKey: 'demo-key',
        triggerWord: 'demo',
      },
    });
  });

  it('shapes meme generation params with billable duration', async () => {
    const { factory } = createFactory();

    const post = await factory.createMemePost(
      {
        aiService: 'wan22_animate_native',
        prompt: '',
        imageUrl: 'https://cdn.test/input.png',
        videoUrl: 'https://cdn.test/source.mp4',
        memeId: 7,
      } as any,
      {
        id: 7,
        name: 'Smoke meme',
        referenceVideoUrl: 'https://cdn.test/reference.mp4',
        referenceVideoDurationSeconds: 4.2,
        tag: null,
      } as any,
      55,
      'https://cdn.test/result.mp4',
      'https://cdn.test/result.jpg',
      { width: 1080, height: 1080, hasAudio: true },
    );

    expect(post.hasAudio).toBe(true);
    expect(post.generationParams).toMatchObject({
      aiService: 'wan22_animate_native',
      memeId: 7,
      billableDurationSeconds: 5,
      sourceImageUrl: 'https://cdn.test/input.png',
      sourceVideoUrl: 'https://cdn.test/reference.mp4',
      width: 1080,
      height: 1080,
    });
    expect(post.generationParams).not.toHaveProperty('suggestedTags');
  });

  it('shapes video generation params with dimensions', async () => {
    const { factory } = createFactory();

    const post = await factory.createVideoPost(
      {
        aiService: 'p_video_text',
        prompt: 'cinematic robot',
        orientation: 'horizontal',
        duration: 5,
        width: 1280,
        height: 720,
        hasAudio: true,
      },
      55,
      'https://cdn.test/video.mp4',
      'https://cdn.test/video-preview.jpg',
      null,
    );

    expect(post.generationParams).toMatchObject({
      aiService: 'p_video_text',
      prompt: 'cinematic robot',
      orientation: 'horizontal',
      duration: 5,
      width: 1280,
      height: 720,
    });
    expect(post.hasAudio).toBe(true);
  });
});
