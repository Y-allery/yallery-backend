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
      resolveContext: jest.fn(async () => ({
        prompt: 'enhanced prompt',
        style: null,
        color: null,
        styleDescriptor: null,
      })),
    };
    const mediaGenerationGuardsService = {
      assertUserCanGeneratePromptImages: jest.fn(async () => 10),
    };
    const mediaGenerationBalanceService = {
      reserve: jest.fn(),
      attachJob: jest.fn(),
      refund: jest.fn(),
    };
    const queue = {
      add: queueAdd,
    };

    const service = new MediaGenerationEnqueueService(
      contestMediaGenerationResolverService as any,
      contestFlowService as any,
      mediaPromptEnhancerService as any,
      mediaGenerationGuardsService as any,
      mediaGenerationBalanceService as any,
      queue as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return {
      service,
      contestFlowService,
      mediaGenerationBalanceService,
      queueAdd,
    };
  };

  it('reserves credits and attaches BullMQ job id to contest submission', async () => {
    const queueAdd = jest.fn(async () => ({ id: 'job-1' }));
    const { service, contestFlowService, mediaGenerationBalanceService } =
      createService(queueAdd);

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

    expect(mediaGenerationBalanceService.reserve).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 55, amount: 10, aiService: 'sdxl' }),
    );
    expect(queueAdd).toHaveBeenCalledWith(
      'sdxl',
      expect.objectContaining({
        userId: 55,
        aiService: 'sdxl',
        chargeId: expect.any(String),
        request: expect.objectContaining({
          prompt: 'enhanced prompt',
          contestSubmissionId: 77,
        }),
      }),
      expect.any(Object),
    );
    expect(contestFlowService.attachQueueJob).toHaveBeenCalledWith(77, 'job-1');
    expect(mediaGenerationBalanceService.attachJob).toHaveBeenCalledWith(
      expect.any(String),
      'job-1',
    );
  });

  it('refunds credits and marks contest submission failed when queue add fails', async () => {
    const queueAdd = jest.fn(async () => {
      throw new Error('queue down');
    });
    const { service, contestFlowService, mediaGenerationBalanceService } =
      createService(queueAdd);

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

    expect(mediaGenerationBalanceService.refund).toHaveBeenCalledWith(
      expect.any(String),
    );
    expect(contestFlowService.markSubmissionFailed).toHaveBeenCalledWith(77);
  });
});
