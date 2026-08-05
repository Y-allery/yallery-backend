import { MediaGenerationEnqueueService } from 'src/modules/media-generation/application/enqueue/media-generation-enqueue.service';

describe('MediaGenerationEnqueueService', () => {
  const createService = (
    queueAdd = jest.fn(),
    {
      textVideoQueueAdd = jest.fn(),
      ltxTextPipelineMode = 'native',
    }: {
      textVideoQueueAdd?: jest.Mock;
      ltxTextPipelineMode?: 'native' | 'cascade';
    } = {},
  ) => {
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
      assertUserCanGenerateVideos: jest.fn(async () => 20),
    };
    const mediaGenerationBalanceService = {
      reserve: jest.fn(),
      attachJob: jest.fn(),
      refund: jest.fn(),
    };
    const queue = {
      add: queueAdd,
    };
    const textVideoQueue = {
      add: textVideoQueueAdd,
    };
    const providerRuntimeConfigService = {
      getString: jest.fn().mockResolvedValue(null),
      getLtxTextPipelineModeFresh: jest
        .fn()
        .mockResolvedValue(ltxTextPipelineMode),
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
      textVideoQueue as any,
      {} as any,
      providerRuntimeConfigService as any,
    );

    return {
      service,
      contestFlowService,
      mediaGenerationBalanceService,
      queueAdd,
      textVideoQueueAdd,
      providerRuntimeConfigService,
    };
  };

  it('reserves credits and attaches BullMQ job id to contest submission', async () => {
    const queueAdd = jest.fn(async () => ({ id: 'job-1' }));
    const { service, contestFlowService, mediaGenerationBalanceService } =
      createService(queueAdd);

    const job = await service.enqueuePromptImageGeneration(
      {
        aiService: 'yengine_photo_pro',
        prompt: 'hello',
        imageQuantity: 1,
        orientation: 'square',
        contestId: 12,
      } as any,
      55,
    );

    expect(job).toEqual({ id: 'job-1' });

    expect(mediaGenerationBalanceService.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 55,
        amount: 10,
        aiService: 'yengine_photo_pro',
      }),
    );
    expect(queueAdd).toHaveBeenCalledWith(
      'yengine_photo_pro',
      expect.objectContaining({
        userId: 55,
        aiService: 'yengine_photo_pro',
        chargeId: expect.any(String),
        request: expect.objectContaining({
          prompt: 'enhanced prompt',
          contestSubmissionId: 77,
        }),
      }),
      expect.objectContaining({
        jobId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        ),
      }),
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
          aiService: 'yengine_photo_pro',
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

  it('fresh-reads and snapshots the LTX text pipeline mode into a new BullMQ job', async () => {
    const textVideoQueueAdd = jest.fn(async () => ({ id: 'video-job-1' }));
    const {
      service,
      providerRuntimeConfigService,
      mediaGenerationBalanceService,
    } = createService(jest.fn(), {
      textVideoQueueAdd,
      ltxTextPipelineMode: 'cascade',
    });

    await service.enqueueTextVideoGeneration(
      {
        aiService: 'yengine_video_text',
        prompt: 'one dancer under stage lights',
        orientation: 'portrait',
        duration: 5,
      } as any,
      55,
    );

    expect(
      providerRuntimeConfigService.getLtxTextPipelineModeFresh,
    ).toHaveBeenCalledTimes(1);
    expect(textVideoQueueAdd).toHaveBeenCalledWith(
      'yengine_video_text',
      expect.objectContaining({
        userId: 55,
        aiService: 'yengine_video_text',
        ltxTextPipelineMode: 'cascade',
        request: expect.objectContaining({
          prompt: 'one dancer under stage lights',
          contestSubmissionId: 77,
        }),
      }),
      expect.objectContaining({ jobId: expect.any(String) }),
    );
    expect(mediaGenerationBalanceService.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 55,
        amount: 20,
        aiService: 'yengine_video_text',
      }),
    );
  });

  it('does not reserve or enqueue when the fresh LTX mode snapshot cannot be read', async () => {
    const textVideoQueueAdd = jest.fn();
    const {
      service,
      providerRuntimeConfigService,
      mediaGenerationBalanceService,
    } = createService(jest.fn(), { textVideoQueueAdd });
    providerRuntimeConfigService.getLtxTextPipelineModeFresh.mockRejectedValueOnce(
      new Error('shared config unavailable'),
    );

    await expect(
      service.enqueueTextVideoGeneration(
        {
          aiService: 'yengine_video_text',
          prompt: 'a waterfall',
          orientation: 'landscape',
          duration: 5,
        } as any,
        55,
      ),
    ).rejects.toThrow('shared config unavailable');

    expect(mediaGenerationBalanceService.reserve).not.toHaveBeenCalled();
    expect(textVideoQueueAdd).not.toHaveBeenCalled();
  });
});
