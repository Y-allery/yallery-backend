import { Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { createHash } from 'crypto';
import { TextVideoPipelineError } from 'src/modules/media-generation/application/text-video/text-video-pipeline.service';
import { MediaTextVideoProcessor } from './media-text-video.processor';

describe('MediaTextVideoProcessor LTX mode snapshots', () => {
  const createProcessor = () => {
    const finalize = {
      finalizeTextVideoGeneration: jest.fn(async () => ({
        data: [{ videoUrl: 'https://cdn.test/video.mp4' }],
      })),
    };
    const pipeline = {
      runOrResume: jest.fn(async () => ({
        data: [{ videoUrl: 'https://cdn.test/cascade-video.mp4' }],
      })),
    };
    const notificationGateway = {
      sendVideoNotification: jest.fn(),
      sendMediaGenerationError: jest.fn(async () => undefined),
    };
    const balance = { refund: jest.fn(async () => undefined) };
    const opsBot = { notifyRunpodFailure: jest.fn(async () => undefined) };
    const workflows = {
      getResumeDirective: jest.fn(
        async (): Promise<any> => ({
          action: 'POLL_I2V',
          workflow: {
            taskId: 'text-video-job-1',
            chargeId: 'charge_12345678',
            state: 'I2V_RUNNING',
            version: 12,
            refundStatus: 'none',
          },
        }),
      ),
      markRefundCompleted: jest.fn(async () => undefined),
    };
    const processor = new MediaTextVideoProcessor(
      finalize as any,
      pipeline as any,
      workflows as any,
      notificationGateway as any,
      balance as any,
      opsBot as any,
    );
    return {
      processor,
      finalize,
      pipeline,
      notificationGateway,
      balance,
      opsBot,
      workflows,
    };
  };

  const job = (ltxTextPipelineMode?: unknown) =>
    ({
      id: 'text-video-job-1',
      data: {
        request: {
          aiService: 'yengine_video_text',
          prompt: 'private user prompt with a silver samurai',
          orientation: 'portrait',
          duration: 5,
        },
        userId: 42,
        aiService: 'yengine_video_text',
        ltxTextPipelineMode,
      },
    }) as any;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps native snapshots on the existing finalization path', async () => {
    const { processor, finalize } = createProcessor();

    await expect(processor.process(job('native'))).resolves.toEqual({
      data: [{ videoUrl: 'https://cdn.test/video.mp4' }],
    });
    expect(finalize.finalizeTextVideoGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        aiService: 'yengine_video_text',
        prompt: 'private user prompt with a silver samurai',
      }),
      42,
    );
  });

  it('treats pre-snapshot legacy jobs as native', async () => {
    const { processor, finalize } = createProcessor();

    await processor.process(job(undefined));

    expect(finalize.finalizeTextVideoGeneration).toHaveBeenCalledTimes(1);
  });

  it('runs a cascade snapshot only through the durable pipeline', async () => {
    const { processor, finalize, pipeline } = createProcessor();

    await expect(processor.process(job('cascade'))).resolves.toEqual({
      data: [{ videoUrl: 'https://cdn.test/cascade-video.mp4' }],
    });
    expect(pipeline.runOrResume).toHaveBeenCalledWith(
      'text-video-job-1',
      expect.objectContaining({ ltxTextPipelineMode: 'cascade' }),
    );
    expect(finalize.finalizeTextVideoGeneration).not.toHaveBeenCalled();
  });

  it('fails an invalid snapshot closed without calling the native provider', async () => {
    const { processor, finalize, pipeline } = createProcessor();

    await expect(processor.process(job('unexpected'))).rejects.toThrow(
      'LTX_TEXT_PIPELINE_INVALID_MODE',
    );
    await expect(processor.process(job(null))).rejects.toThrow(
      'LTX_TEXT_PIPELINE_INVALID_MODE',
    );
    expect(finalize.finalizeTextVideoGeneration).not.toHaveBeenCalled();
    expect(pipeline.runOrResume).not.toHaveBeenCalled();
  });

  it('logs only the SHA-256 prompt hash and task metadata, never prompt text', async () => {
    const { processor } = createProcessor();
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const rawPrompt = 'private user prompt with a silver samurai';
    const expectedHash = createHash('sha256')
      .update(rawPrompt, 'utf8')
      .digest('hex');

    await processor.process(job('native'));

    const renderedLog = log.mock.calls.flat().join(' ');
    expect(renderedLog).toContain(expectedHash);
    expect(renderedLog).toContain('text-video-job-1');
    expect(renderedLog).toContain('yengine_video_text');
    expect(renderedLog).not.toContain(rawPrompt);
    expect(renderedLog).not.toContain(rawPrompt.substring(0, 20));
  });

  it('marks nonretryable cascade failures unrecoverable', async () => {
    const { processor, pipeline } = createProcessor();
    pipeline.runOrResume.mockRejectedValueOnce(
      new TextVideoPipelineError('VIDEO_QC_TEMPORAL_ARTIFACT', false),
    );

    await expect(processor.process(job('cascade'))).rejects.toEqual(
      expect.objectContaining({
        name: 'UnrecoverableError',
        message: 'VIDEO_QC_TEMPORAL_ARTIFACT',
      }),
    );
  });

  it('preserves retryable cascade failures for BullMQ resume', async () => {
    const { processor, pipeline } = createProcessor();
    const retryable = new TextVideoPipelineError(
      'RUNPOD_STATUS_UNAVAILABLE',
      true,
    );
    pipeline.runOrResume.mockRejectedValueOnce(retryable);

    await expect(processor.process(job('cascade'))).rejects.toBe(retryable);
  });

  it('sends terminal notifications on the first unrecoverable failure event', async () => {
    const { processor, notificationGateway, balance, opsBot, workflows } =
      createProcessor();
    workflows.getResumeDirective.mockResolvedValueOnce({
      action: 'REFUND',
      idempotencyKey: 'charge_12345678',
      workflow: {
        taskId: 'text-video-job-1',
        chargeId: 'charge_12345678',
        state: 'FAILED',
        version: 13,
        refundStatus: 'required',
      },
    });
    const failedJob = {
      ...job('cascade'),
      data: {
        ...job('cascade').data,
        chargeId: 'charge_12345678',
      },
      attemptsMade: 1,
      opts: { attempts: 3 },
    } as any;

    await processor.onFailed(
      failedJob,
      new UnrecoverableError('VIDEO_QC_TEMPORAL_ARTIFACT'),
    );

    expect(balance.refund).toHaveBeenCalledTimes(1);
    expect(balance.refund).toHaveBeenCalledWith('charge_12345678');
    expect(workflows.markRefundCompleted).toHaveBeenCalledWith(
      'text-video-job-1',
      13,
    );
    expect(opsBot.notifyRunpodFailure).toHaveBeenCalledTimes(1);
    expect(notificationGateway.sendMediaGenerationError).toHaveBeenCalledTimes(
      1,
    );
    expect(notificationGateway.sendMediaGenerationError).toHaveBeenCalledWith(
      '42',
      expect.objectContaining({
        type: 'video',
        message: 'Generation failed: VIDEO_QC_TEMPORAL_ARTIFACT',
        taskId: 'text-video-job-1',
      }),
    );
  });

  it('does not send terminal notifications while a retryable failure has attempts left', async () => {
    const { processor, notificationGateway, balance, opsBot } =
      createProcessor();
    const failedJob = {
      ...job('cascade'),
      data: {
        ...job('cascade').data,
        chargeId: 'charge_12345678',
      },
      attemptsMade: 1,
      opts: { attempts: 3 },
    } as any;

    await processor.onFailed(
      failedJob,
      new TextVideoPipelineError('RUNPOD_STATUS_UNAVAILABLE', true),
    );

    expect(balance.refund).not.toHaveBeenCalled();
    expect(opsBot.notifyRunpodFailure).not.toHaveBeenCalled();
    expect(notificationGateway.sendMediaGenerationError).not.toHaveBeenCalled();
  });

  it.each(['FINALIZING', 'COMPLETED'] as const)(
    'never refunds or emits a terminal failure for durable %s work',
    async (state) => {
      const { processor, notificationGateway, balance, opsBot, workflows } =
        createProcessor();
      workflows.getResumeDirective.mockResolvedValueOnce({
        action: state === 'FINALIZING' ? 'FINALIZE_POST' : 'DONE',
        ...(state === 'FINALIZING'
          ? { idempotencyKey: 'text-video-job-1' }
          : {}),
        workflow: {
          taskId: 'text-video-job-1',
          chargeId: 'charge_12345678',
          state,
          version: 14,
          refundStatus: 'none',
        },
      });
      const failedJob = {
        ...job('cascade'),
        data: {
          ...job('cascade').data,
          chargeId: 'charge_12345678',
        },
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as any;

      await processor.onFailed(
        failedJob,
        new TextVideoPipelineError('LTX_CASCADE_INTERNAL_ERROR', true),
      );

      expect(balance.refund).not.toHaveBeenCalled();
      expect(workflows.markRefundCompleted).not.toHaveBeenCalled();
      expect(opsBot.notifyRunpodFailure).not.toHaveBeenCalled();
      expect(
        notificationGateway.sendMediaGenerationError,
      ).not.toHaveBeenCalled();
    },
  );

  it('defers settlement without refund when durable workflow state is unavailable', async () => {
    const { processor, notificationGateway, balance, opsBot, workflows } =
      createProcessor();
    workflows.getResumeDirective.mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    const failedJob = {
      ...job('cascade'),
      data: {
        ...job('cascade').data,
        chargeId: 'charge_12345678',
      },
      attemptsMade: 3,
      opts: { attempts: 3 },
    } as any;

    await processor.onFailed(
      failedJob,
      new TextVideoPipelineError(
        'TEXT_VIDEO_WORKFLOW_PERSISTENCE_FAILED',
        true,
      ),
    );

    expect(balance.refund).not.toHaveBeenCalled();
    expect(workflows.markRefundCompleted).not.toHaveBeenCalled();
    expect(opsBot.notifyRunpodFailure).not.toHaveBeenCalled();
    expect(notificationGateway.sendMediaGenerationError).not.toHaveBeenCalled();
  });

  it('refuses a refund directive whose durable charge identity does not match', async () => {
    const { processor, notificationGateway, balance, workflows } =
      createProcessor();
    workflows.getResumeDirective.mockResolvedValueOnce({
      action: 'REFUND',
      idempotencyKey: 'different_charge_12345678',
      workflow: {
        taskId: 'text-video-job-1',
        chargeId: 'charge_12345678',
        state: 'FAILED',
        version: 13,
        refundStatus: 'required',
      },
    });
    const failedJob = {
      ...job('cascade'),
      data: {
        ...job('cascade').data,
        chargeId: 'charge_12345678',
      },
      attemptsMade: 3,
      opts: { attempts: 3 },
    } as any;

    await processor.onFailed(
      failedJob,
      new UnrecoverableError('VIDEO_QC_TEMPORAL_ARTIFACT'),
    );

    expect(balance.refund).not.toHaveBeenCalled();
    expect(workflows.markRefundCompleted).not.toHaveBeenCalled();
    expect(notificationGateway.sendMediaGenerationError).not.toHaveBeenCalled();
  });

  it('retries a nonretryable pipeline error when durable state is FINALIZING', async () => {
    const { processor, pipeline, workflows } = createProcessor();
    pipeline.runOrResume.mockRejectedValueOnce(
      new TextVideoPipelineError('LTX_CASCADE_INTERNAL_ERROR', false),
    );
    workflows.getResumeDirective.mockResolvedValueOnce({
      action: 'FINALIZE_POST',
      idempotencyKey: 'text-video-job-1',
      workflow: {
        taskId: 'text-video-job-1',
        chargeId: 'charge_12345678',
        state: 'FINALIZING',
        version: 14,
        refundStatus: 'none',
      },
    });

    await expect(processor.process(job('cascade'))).rejects.toMatchObject({
      reasonCode: 'LTX_CASCADE_INTERNAL_ERROR',
      retryable: true,
    });
  });

  it('retries a nonretryable pipeline error when durable state cannot be read', async () => {
    const { processor, pipeline, workflows } = createProcessor();
    pipeline.runOrResume.mockRejectedValueOnce(
      new TextVideoPipelineError(
        'TEXT_VIDEO_WORKFLOW_PERSISTENCE_FAILED',
        false,
      ),
    );
    workflows.getResumeDirective.mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    await expect(processor.process(job('cascade'))).rejects.toMatchObject({
      reasonCode: 'TEXT_VIDEO_WORKFLOW_PERSISTENCE_FAILED',
      retryable: true,
    });
  });
});
