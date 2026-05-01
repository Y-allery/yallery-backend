import { MediaGenerationFinalizeService } from 'src/modules/media-generation/application/finalize/media-generation-finalize.service';

describe('MediaGenerationFinalizeService', () => {
  const createService = () => {
    const contestFlowService = {
      completeGenerationPosts: jest.fn(async (_submissionId, posts) => posts),
    };
    const generatedPostFactory = {
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
      generateAudio: jest.fn(async () => ({
        videoUrl: 'https://cdn.test/result.mp4',
        previewImageUrl: 'https://cdn.test/eager-preview.jpg',
        rawOutput: { job: 'ok' },
      })),
      generateTextVideos: jest.fn(async () => ({
        videoUrl: 'https://cdn.test/text-video.mp4',
        previewImageUrl: 'https://cdn.test/text-video-preview.jpg',
        rawOutput: { job: 'text-video-ok' },
      })),
      generateImageVideos: jest.fn(async () => ({
        videoUrl: 'https://cdn.test/image-video.mp4',
        previewImageUrl: 'https://cdn.test/image-video-preview.jpg',
        rawOutput: { job: 'image-video-ok' },
      })),
      generateMemes: jest.fn(async () => ({
        videoUrl: 'https://cdn.test/meme.mp4',
        previewImageUrl: 'https://cdn.test/meme-preview.jpg',
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
      getAudioCost: jest.fn(async () => 25),
      getVideoCost: jest.fn(async () => 25),
      getMemeCost: jest.fn(async () => 25),
    };
    const mediaTagResolverService = {
      resolveTagForPrompt: jest.fn(async () => null),
    };
    const notificationGateway = {
      emitProfileUpdate: jest.fn(),
    };
    const userActivityService = {
      logMediaGenerationSpent: jest.fn(),
    };
    const contestRepository = {
      findOne: jest.fn(),
    };
    const userRepository = {
      save: jest.fn(async (user) => user),
    };

    const service = new MediaGenerationFinalizeService(
      contestFlowService as any,
      generatedPostFactory as any,
      mediaGenerationExecutionService as any,
      mediaGenerationGuardsService as any,
      mediaGenerationPricingService as any,
      mediaTagResolverService as any,
      notificationGateway as any,
      userActivityService as any,
      contestRepository as any,
      userRepository as any,
    );

    return {
      service,
      contestFlowService,
      generatedPostFactory,
      mediaGenerationExecutionService,
      notificationGateway,
      userActivityService,
      userRepository,
    };
  };

  it('deducts points once and publishes audio post through contest flow', async () => {
    const {
      service,
      contestFlowService,
      generatedPostFactory,
      notificationGateway,
      userActivityService,
      userRepository,
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

    expect(userRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 55, points: 75 }),
    );
    expect(notificationGateway.emitProfileUpdate).toHaveBeenCalledWith('55');
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
    expect(result).toMatchObject({
      data: [{ id: 9, videoUrl: 'https://cdn.test/result.mp4' }],
      rawOutput: { job: 'ok' },
    });
  });

  it('uses provider eager preview for text-to-video posts', async () => {
    const { service, generatedPostFactory } = createService();

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
      expect.objectContaining({ aiService: 'p_video_text' }),
      55,
      'https://cdn.test/text-video.mp4',
      'https://cdn.test/text-video-preview.jpg',
      null,
    );
  });

  it('uses provider eager preview for image-to-video posts', async () => {
    const { service, generatedPostFactory } = createService();

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
      expect.objectContaining({ sourceImageUrl: 'https://cdn.test/source.png' }),
      55,
      'https://cdn.test/image-video.mp4',
      'https://cdn.test/image-video-preview.jpg',
      null,
    );
  });

  it('falls back to source image when image-to-video eager preview is missing', async () => {
    const { service, generatedPostFactory, mediaGenerationExecutionService } =
      createService();

    mediaGenerationExecutionService.generateImageVideos.mockResolvedValueOnce({
      videoUrl: 'https://cdn.test/image-video.mp4',
      previewImageUrl: null,
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
    const { service, generatedPostFactory } = createService();

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
    );
  });
});
