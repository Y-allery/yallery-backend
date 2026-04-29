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
    };
    const mediaGenerationExecutionService = {
      generateAudio: jest.fn(async () => ({
        videoUrl: 'https://cdn.test/result.mp4',
        rawOutput: { job: 'ok' },
      })),
    };
    const mediaGenerationGuardsService = {
      getRequiredUser: jest.fn(async () => ({ id: 55, points: 100 })),
    };
    const mediaGenerationPricingService = {
      getAudioCost: jest.fn(async () => 25),
    };
    const mediaPreviewService = {
      generateCloudinaryVideoPreviewUrl: jest.fn(
        () => 'https://cdn.test/result.jpg',
      ),
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
      mediaPreviewService as any,
      mediaTagResolverService as any,
      notificationGateway as any,
      userActivityService as any,
      contestRepository as any,
      userRepository as any,
    );

    return {
      service,
      contestFlowService,
      notificationGateway,
      userActivityService,
      userRepository,
    };
  };

  it('deducts points once and publishes audio post through contest flow', async () => {
    const {
      service,
      contestFlowService,
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
});
