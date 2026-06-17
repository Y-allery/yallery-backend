import { MediaGenerationFinalizeService } from 'src/modules/media-generation/application/finalize/media-generation-finalize.service';

describe('MediaGenerationFinalizeService', () => {
  const createService = () => {
    const contestFlowService = {
      completeGenerationPosts: jest.fn(async (_submissionId, posts) => posts),
    };
    const generatedPostFactory = {
      createPromptImagePost: jest.fn(async (_request, _userId, imageUrl) => ({
        id: 7,
        imageUrl,
        videoUrl: null,
        previewImageUrl: null,
        generationParams: { aiService: 'flux2_klein' },
      })),
      createEditedImagePost: jest.fn(async (_request, _userId, imageUrl) => ({
        id: 8,
        imageUrl,
        videoUrl: null,
        previewImageUrl: null,
        generationParams: { aiService: 'qwen_image_edit_baked' },
      })),
      createAudioPost: jest.fn(async () => ({
        id: 9,
        imageUrl: null,
        videoUrl: 'https://cdn.test/result.mp4',
        previewImageUrl: 'https://cdn.test/result.jpg',
        generationParams: { aiService: 'mmaudio_v2' },
      })),
      createVideoPost: jest.fn(async (_params, _userId, videoUrl, previewImageUrl) => ({
        id: 10,
        imageUrl: null,
        videoUrl,
        previewImageUrl,
        generationParams: { aiService: 'p_video_text' },
      })),
      createMemePost: jest.fn(async (_request, _meme, _userId, videoUrl, previewImageUrl) => ({
        id: 11,
        imageUrl: null,
        videoUrl,
        previewImageUrl,
        generationParams: { aiService: 'wan22_animate_native' },
      })),
    };
    const mediaGenerationExecutionService = {
      generatePromptImages: jest.fn(async () => ({
        imageUrls: ['https://cdn.test/prompt-image.jpg'],
        rawOutput: { job: 'prompt-image-ok' },
      })),
      editImages: jest.fn(async () => ({
        imageUrls: ['https://cdn.test/edited-image.jpg'],
        rawOutput: { job: 'edit-image-ok' },
      })),
      generateAudio: jest.fn(async () => ({
        videoUrl: 'https://cdn.test/result.mp4',
        previewImageUrl: 'https://cdn.test/eager-preview.jpg',
        width: 1920,
        height: 1080,
        hasAudio: true,
        rawOutput: { job: 'ok' },
      })),
      generateTextVideos: jest.fn(async () => ({
        videoUrl: 'https://cdn.test/text-video.mp4',
        previewImageUrl: 'https://cdn.test/text-video-preview.jpg',
        width: 1280,
        height: 720,
        hasAudio: true,
        rawOutput: { job: 'text-video-ok' },
      })),
      generateImageVideos: jest.fn(async () => ({
        videoUrl: 'https://cdn.test/image-video.mp4',
        previewImageUrl: 'https://cdn.test/image-video-preview.jpg',
        width: 720,
        height: 1280,
        hasAudio: false,
        rawOutput: { job: 'image-video-ok' },
      })),
      generateMemes: jest.fn(async () => ({
        videoUrl: 'https://cdn.test/meme.mp4',
        previewImageUrl: 'https://cdn.test/meme-preview.jpg',
        width: 1080,
        height: 1080,
        hasAudio: true,
        rawOutput: { job: 'meme-ok' },
      })),
    };
    const mediaGenerationGuardsService = {
      getRequiredUser: jest.fn(async () => ({ id: 55, points: 100 })),
      getRequiredMeme: jest.fn(async () => ({
        id: 4,
        referenceImageUrl: 'https://cdn.test/meme-reference.jpg',
        referenceVideoDurationSeconds: 3.2,
        tag: null,
      })),
    };
    const mediaGenerationPricingService = {
      getPromptImageCost: jest.fn(async () => 20),
      getImageEditCost: jest.fn(async () => 22),
      getAudioCost: jest.fn(async () => 25),
      getVideoCost: jest.fn(async () => 25),
      getMemeCost: jest.fn(async () => 25),
    };
    const mediaTagResolverService = {
      resolveTagForPrompt: jest.fn(async () => null),
    };
    const userActivityService = {
      logMediaGenerationSpent: jest.fn(),
    };
    const partnershipActivityLogger = {
      logOnceForUser: jest.fn(),
    };
    const contestRepository = {
      findOne: jest.fn(),
    };

    const service = new MediaGenerationFinalizeService(
      contestFlowService as any,
      generatedPostFactory as any,
      mediaGenerationExecutionService as any,
      mediaGenerationGuardsService as any,
      mediaGenerationPricingService as any,
      mediaTagResolverService as any,
      userActivityService as any,
      partnershipActivityLogger as any,
      contestRepository as any,
    );

    return {
      service,
      contestFlowService,
      generatedPostFactory,
      mediaGenerationExecutionService,
      userActivityService,
      partnershipActivityLogger,
    };
  };

  it('logs image_generated after prompt image posts are completed', async () => {
    const {
      service,
      contestFlowService,
      partnershipActivityLogger,
      userActivityService,
    } = createService();

    await service.finalizePromptImageGeneration(
      {
        aiService: 'flux2_klein',
        prompt: 'castle',
        imageQuantity: 1,
        orientation: 'vertical',
      } as any,
      55,
    );

    expect(partnershipActivityLogger.logOnceForUser).toHaveBeenCalledWith(
      55,
      'image_generated',
    );
    expect(
      contestFlowService.completeGenerationPosts.mock.invocationCallOrder[0],
    ).toBeLessThan(
      partnershipActivityLogger.logOnceForUser.mock.invocationCallOrder[0],
    );
    expect(
      partnershipActivityLogger.logOnceForUser.mock.invocationCallOrder[0],
    ).toBeLessThan(
      userActivityService.logMediaGenerationSpent.mock.invocationCallOrder[0],
    );
  });

  it('logs image_generated after image edit posts are completed', async () => {
    const { service, contestFlowService, partnershipActivityLogger } =
      createService();

    await service.finalizeImageEditGeneration(
      {
        aiService: 'qwen_image_edit_baked',
        prompt: 'edit',
        imageUrl: 'https://cdn.test/source.jpg',
      } as any,
      55,
    );

    expect(partnershipActivityLogger.logOnceForUser).toHaveBeenCalledWith(
      55,
      'image_generated',
    );
    expect(
      contestFlowService.completeGenerationPosts.mock.invocationCallOrder[0],
    ).toBeLessThan(
      partnershipActivityLogger.logOnceForUser.mock.invocationCallOrder[0],
    );
  });

  it('publishes audio post through contest flow without touching the balance', async () => {
    const {
      service,
      contestFlowService,
      generatedPostFactory,
      userActivityService,
      partnershipActivityLogger,
    } = createService();

    const result = await service.finalizeAudioGeneration(
      {
        aiService: 'mmaudio_v2',
        prompt: 'soundtrack',
        videoUrl: 'https://cdn.test/source.mp4',
        contestSubmissionId: 88,
      },
      55,
    );

    expect(contestFlowService.completeGenerationPosts).toHaveBeenCalledWith(
      88,
      [expect.objectContaining({ id: 9 })],
    );
    expect(generatedPostFactory.createAudioPost).toHaveBeenCalledWith(
      expect.any(Object),
      55,
      'https://cdn.test/result.mp4',
      'https://cdn.test/eager-preview.jpg',
      null,
      { width: 1920, height: 1080, hasAudio: true },
    );
    expect(userActivityService.logMediaGenerationSpent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 55,
        pointsDelta: -25,
        mediaType: 'audio',
        mode: 'audio_generation',
        postId: 9,
      }),
    );
    expect(partnershipActivityLogger.logOnceForUser).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      data: [{ id: 9, videoUrl: 'https://cdn.test/result.mp4' }],
      rawOutput: { job: 'ok' },
    });
  });

  it('uses provider eager preview for text-to-video posts', async () => {
    const { service, generatedPostFactory, partnershipActivityLogger } =
      createService();

    await service.finalizeTextVideoGeneration(
      {
        aiService: 'p_video_text',
        prompt: 'robot',
        orientation: 'horizontal',
        duration: 5,
      },
      55,
    );

    expect(generatedPostFactory.createVideoPost).toHaveBeenCalledWith(
      expect.objectContaining({
        aiService: 'p_video_text',
        width: 1280,
        height: 720,
        hasAudio: true,
      }),
      55,
      'https://cdn.test/text-video.mp4',
      'https://cdn.test/text-video-preview.jpg',
      null,
    );
    expect(partnershipActivityLogger.logOnceForUser).not.toHaveBeenCalled();
  });

  it('uses provider eager preview for image-to-video posts', async () => {
    const { service, generatedPostFactory, partnershipActivityLogger } =
      createService();

    await service.finalizeImageVideoGeneration(
      {
        aiService: 'p_video_image',
        prompt: 'animate',
        imageUrl: 'https://cdn.test/source.png',
        orientation: 'vertical',
        duration: 5,
      },
      55,
    );

    expect(generatedPostFactory.createVideoPost).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceImageUrl: 'https://cdn.test/source.png',
        width: 720,
        height: 1280,
        hasAudio: false,
      }),
      55,
      'https://cdn.test/image-video.mp4',
      'https://cdn.test/image-video-preview.jpg',
      null,
    );
    expect(partnershipActivityLogger.logOnceForUser).not.toHaveBeenCalled();
  });

  it('falls back to source image when image-to-video eager preview is missing', async () => {
    const { service, generatedPostFactory, mediaGenerationExecutionService } =
      createService();

    mediaGenerationExecutionService.generateImageVideos.mockResolvedValueOnce({
      videoUrl: 'https://cdn.test/image-video.mp4',
      previewImageUrl: null,
      width: null,
      height: null,
      hasAudio: null,
      rawOutput: { job: 'image-video-ok' },
    });

    await service.finalizeImageVideoGeneration(
      {
        aiService: 'p_video_image',
        prompt: 'animate',
        imageUrl: 'https://cdn.test/source.png',
        orientation: 'vertical',
        duration: 5,
      },
      55,
    );

    expect(generatedPostFactory.createVideoPost).toHaveBeenCalledWith(
      expect.any(Object),
      55,
      'https://cdn.test/image-video.mp4',
      'https://cdn.test/source.png',
      null,
    );
  });

  it('uses provider eager preview for meme posts', async () => {
    const { service, generatedPostFactory, partnershipActivityLogger } =
      createService();

    await service.finalizeMemeGeneration(
      {
        aiService: 'wan22_animate_native',
        memeId: 4,
        imageUrl: 'https://cdn.test/source.png',
        videoUrl: 'https://cdn.test/reference.mp4',
      },
      55,
    );

    expect(generatedPostFactory.createMemePost).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ id: 4 }),
      55,
      'https://cdn.test/meme.mp4',
      'https://cdn.test/meme-preview.jpg',
      { width: 1080, height: 1080, hasAudio: true },
    );
    expect(partnershipActivityLogger.logOnceForUser).not.toHaveBeenCalled();
  });
});
