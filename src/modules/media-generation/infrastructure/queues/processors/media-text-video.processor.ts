import { OnWorkerEvent, Processor } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { Job, UnrecoverableError } from 'bullmq';
import { NotificationGateway } from 'src/modules/notifications/notification.gateway';
import { MEDIA_TEXT_VIDEO_GENERATION_QUEUE } from 'src/modules/media-generation/infrastructure/queues/constants/media-generation.queue';
import { MediaGenerationFinalizeService } from 'src/modules/media-generation/application/finalize/media-generation-finalize.service';
import { MediaGenerationBalanceService } from 'src/modules/media-generation/application/balance/media-generation-balance.service';
import { BaseMediaProcessor } from './base-media.processor';
import { VideoNotificationPresenter } from 'src/modules/media-generation/infrastructure/queues/presenters/video-notification.presenter';
import { OpsBotService } from 'src/modules/ops-bot/ops-bot.service';
import { MediaTextVideoJobData } from 'src/modules/media-generation/domain/contracts/media-text-video-job-data.contract';
import {
  DEFAULT_LTX_TEXT_PIPELINE_MODE,
  parseLtxTextPipelineMode,
} from 'src/modules/media-generation/domain/contracts/ltx-text-pipeline-mode.contract';
import { TEXT_VIDEO_WORKFLOW_STATE_MACHINE } from 'src/modules/media-generation/application/text-video/text-video-pipeline.ports';
import {
  TextVideoPipelineError,
  TextVideoPipelineService,
} from 'src/modules/media-generation/application/text-video/text-video-pipeline.service';
import { TextVideoWorkflowService } from 'src/modules/media-generation/application/text-video/text-video-workflow.service';

@Injectable()
@Processor(MEDIA_TEXT_VIDEO_GENERATION_QUEUE, {
  concurrency: 3,
  lockDuration: 900000,
})
export class MediaTextVideoProcessor extends BaseMediaProcessor {
  private readonly logger = new Logger(MediaTextVideoProcessor.name);

  constructor(
    private readonly mediaGenerationFinalizeService: MediaGenerationFinalizeService,
    private readonly textVideoPipelineService: TextVideoPipelineService,
    @Inject(TEXT_VIDEO_WORKFLOW_STATE_MACHINE)
    private readonly textVideoWorkflows: TextVideoWorkflowService,
    notificationGateway: NotificationGateway,
    private readonly cascadeBalanceService: MediaGenerationBalanceService,
    opsBotService: OpsBotService,
  ) {
    super(notificationGateway, 'video', cascadeBalanceService, opsBotService);
  }

  async process(job: Job<MediaTextVideoJobData>) {
    const { request, userId } = job.data;

    if (!userId) {
      throw new Error('userId is required for media text video generation');
    }

    // Jobs produced before the snapshot field existed are intentionally native.
    // Any present-but-invalid value fails closed in parseLtxTextPipelineMode.
    const ltxTextPipelineMode = parseLtxTextPipelineMode(
      job.data.ltxTextPipelineMode === undefined
        ? DEFAULT_LTX_TEXT_PIPELINE_MODE
        : job.data.ltxTextPipelineMode,
    );
    const promptSha256 = createHash('sha256')
      .update(request.prompt, 'utf8')
      .digest('hex');

    this.logger.log(
      `[MediaTextVideoProcessor] Starting generation | Job: ${job.id} | User: ${userId} | Service: ${request.aiService} | Pipeline: ${ltxTextPipelineMode} | Prompt-SHA256: ${promptSha256}`,
    );

    if (ltxTextPipelineMode === 'cascade') {
      if (job.id === undefined || job.id === null) {
        throw new Error('LTX_CASCADE_TASK_ID_REQUIRED');
      }
      try {
        const result = await this.textVideoPipelineService.runOrResume(
          String(job.id),
          {
            ...job.data,
            ltxTextPipelineMode,
          },
        );
        return { data: result.data };
      } catch (error) {
        if (error instanceof TextVideoPipelineError && !error.retryable) {
          const directive = await this.loadCascadeResumeDirective(
            String(job.id),
          );
          if (
            !directive ||
            directive.action === 'FINALIZE_POST' ||
            directive.workflow.state === 'COMPLETED'
          ) {
            throw new TextVideoPipelineError(error.reasonCode, true);
          }
          throw new UnrecoverableError(error.reasonCode);
        }
        throw error;
      }
    }

    const result =
      await this.mediaGenerationFinalizeService.finalizeTextVideoGeneration(
        request,
        userId,
      );

    return { data: result.data };
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<MediaTextVideoJobData>, err: Error) {
    const unrecoverable =
      err instanceof UnrecoverableError || err.name === 'UnrecoverableError';
    const cascade = job.data?.ltxTextPipelineMode === 'cascade';
    if (cascade) {
      const attemptsMade = job.attemptsMade || 0;
      const maxAttempts = job.opts?.attempts ?? 3;
      if (!unrecoverable && attemptsMade < maxAttempts) {
        return;
      }

      const taskId =
        job.id === undefined || job.id === null ? null : String(job.id);
      const directive = taskId
        ? await this.loadCascadeResumeDirective(taskId)
        : null;
      if (!directive) {
        this.logger.warn(
          `[MediaTextVideoProcessor] Deferring failed cascade settlement because durable workflow state is unavailable | Job: ${job.id}`,
        );
        return;
      }

      if (directive.action === 'REFUND') {
        if (
          directive.idempotencyKey !== directive.workflow.chargeId ||
          directive.workflow.taskId !== taskId
        ) {
          this.logger.error(
            `[MediaTextVideoProcessor] Refusing inconsistent durable cascade refund directive | Job: ${job.id}`,
          );
          return;
        }
        try {
          await this.cascadeBalanceService.refund(directive.idempotencyKey);
          await this.textVideoWorkflows.markRefundCompleted(
            directive.workflow.taskId,
            directive.workflow.version,
          );
        } catch (error) {
          this.logger.error(
            `[MediaTextVideoProcessor] Durable cascade refund settlement failed | Job: ${job.id} | Reason: ${
              error instanceof Error ? error.message : 'unknown'
            }`,
          );
        }
      } else if (directive.workflow.state !== 'FAILED') {
        this.logger.warn(
          `[MediaTextVideoProcessor] Suppressing terminal cascade refund outside FAILED/required | Job: ${job.id} | State: ${directive.workflow.state}`,
        );
        return;
      }

      await this.handleFailedGeneration(job, err, 'Generation failed', {
        forceTerminal: unrecoverable,
        automaticRefund: false,
      });
      return;
    }

    await this.handleFailedGeneration(job, err, 'Generation failed', {
      forceTerminal: unrecoverable,
    });
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job<MediaTextVideoJobData>) {
    const { userId } = job.data;
    const data = this.getCompletedData<any>(job, 'MediaTextVideoProcessor');

    if (!userId || !data) {
      return;
    }

    const [video] = data;
    await this.notificationGateway.sendVideoNotification(
      userId.toString(),
      VideoNotificationPresenter.generated(video),
      undefined,
      String(job.id),
    );
  }

  private async loadCascadeResumeDirective(taskId: string) {
    try {
      return await this.textVideoWorkflows.getResumeDirective(taskId);
    } catch (error) {
      this.logger.warn(
        `[MediaTextVideoProcessor] Could not read durable cascade workflow | Job: ${taskId} | Reason: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      return null;
    }
  }
}
