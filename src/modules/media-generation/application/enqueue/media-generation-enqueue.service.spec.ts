import { MediaGenerationEnqueueService } from 'src/modules/media-generation/application/enqueue/media-generation-enqueue.service';

describe('MediaGenerationEnqueueService', () => {
  const createService = (queueAdd = jest.fn()) => {
    const contestMediaGenerationResolverService = {
      resolvePromptImageRequest: jest.fn(async (request) => request),
    };
    const contestFlowService = {
      startSubmission: jest.fn(async () => ({ id: 77 })),
      attachQueueJob: jest.fn(),
      markSubmissionFailed: jest.fn(),
    };
    const mediaPromptEnhancerService = {
      enhancePrompt: jest.fn(async () => ({
        translatedPrompt: 'translated prompt',
        enhancedPrompt: 'enhanced prompt',
        style: null,
        color: null,
      })),
    };
    const mediaGenerationGuardsService = {
      assertUserCanGeneratePromptImages: jest.fn(),
    };
    const queue = {
      add: queueAdd,
    };

    const service = new MediaGenerationEnqueueService(
      contestMediaGenerationResolverService as any,
      contestFlowService as any,
      mediaPromptEnhancerService as any,
      mediaGenerationGuardsService as any,
      queue as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return { service, contestFlowService, queueAdd };
  };

  it('attaches BullMQ job id to contest submission', async () => {
    const queueAdd = jest.fn(async () => ({ id: 'job-1' }));
    const { service, contestFlowService } = createService(queueAdd);

    await service.enqueuePromptImageGeneration(
      {
        aiService: 'sdxl',
        prompt: 'hello',
        imageQuantity: 1,
        orientation: 'square',
        contestId: 12,
      } as any,
      55,
    );

    expect(queueAdd).toHaveBeenCalledWith(
      'sdxl',
      expect.objectContaining({
        userId: 55,
        aiService: 'sdxl',
        request: expect.objectContaining({
          resolvedPrompt: 'enhanced prompt',
          contestSubmissionId: 77,
        }),
      }),
      expect.any(Object),
    );
    expect(contestFlowService.attachQueueJob).toHaveBeenCalledWith(77, 'job-1');
  });

  it('marks contest submission failed when queue add fails', async () => {
    const queueAdd = jest.fn(async () => {
      throw new Error('queue down');
    });
    const { service, contestFlowService } = createService(queueAdd);

    await expect(
      service.enqueuePromptImageGeneration(
        {
          aiService: 'sdxl',
          prompt: 'hello',
          imageQuantity: 1,
          orientation: 'square',
          contestId: 12,
        } as any,
        55,
      ),
    ).rejects.toThrow('queue down');

    expect(contestFlowService.markSubmissionFailed).toHaveBeenCalledWith(77);
  });
});
