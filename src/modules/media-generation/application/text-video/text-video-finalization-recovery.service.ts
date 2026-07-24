import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash } from 'crypto';
import { Job, Queue } from 'bullmq';
import { MediaTextVideoJobData } from 'src/modules/media-generation/domain/contracts/media-text-video-job-data.contract';
import { MediaTextVideoWorkflowEntity } from 'src/modules/media-generation/persistence/entities/media-text-video-workflow.entity';
import { MEDIA_TEXT_VIDEO_GENERATION_QUEUE } from 'src/modules/media-generation/infrastructure/queues/constants/media-generation.queue';
import { TEXT_VIDEO_WORKFLOW_REPOSITORY } from './text-video-pipeline.ports';
import { TextVideoWorkflowRepository } from './text-video-workflow.repository';

const FINALIZATION_STALE_AFTER_MS = 15 * 60_000;
const FINALIZATION_RECOVERY_BATCH_SIZE = 25;

/**
 * Recovers FINALIZING workflows whose ordinary BullMQ attempts were exhausted.
 *
 * The raw request is intentionally not stored in the workflow row, so recovery
 * may only reprocess the original retained BullMQ job. Job.retry('failed') is
 * an atomic Redis transition (failed ZREM -> waiting push): it is the per-job
 * lease between overlapping application instances. No replacement job is ever
 * synthesized, and active/waiting/delayed work is never disturbed.
 */
@Injectable()
export class TextVideoFinalizationRecoveryService {
  private readonly logger = new Logger(
    TextVideoFinalizationRecoveryService.name,
  );

  constructor(
    @Inject(TEXT_VIDEO_WORKFLOW_REPOSITORY)
    private readonly repository: TextVideoWorkflowRepository,
    @InjectQueue(MEDIA_TEXT_VIDEO_GENERATION_QUEUE)
    private readonly queue: Queue<MediaTextVideoJobData>,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async recoverStaleFinalizations(): Promise<void> {
    const cutoff = new Date(Date.now() - FINALIZATION_STALE_AFTER_MS);
    let candidates: MediaTextVideoWorkflowEntity[];
    try {
      candidates = await this.repository.findStaleFinalizing(
        cutoff,
        FINALIZATION_RECOVERY_BATCH_SIZE,
      );
    } catch (error) {
      this.logger.warn(
        `Finalization recovery scan deferred | Reason: ${safeRecoveryReason(
          error,
        )}`,
      );
      return;
    }

    for (const candidate of candidates) {
      await this.recoverOne(candidate.taskId, cutoff);
    }
  }

  private async recoverOne(taskId: string, cutoff: Date): Promise<void> {
    try {
      const workflow = await this.repository.findByTaskId(taskId);
      if (!isRecoverableWorkflow(workflow, cutoff)) {
        return;
      }

      const job = await this.queue.getJob(taskId);
      if (!job) {
        this.logger.error(
          `Finalization recovery refused: retained BullMQ job missing | Task: ${taskId}`,
        );
        return;
      }
      if (!matchesDurableWorkflow(job, workflow)) {
        this.logger.error(
          `Finalization recovery refused: BullMQ payload mismatch | Task: ${taskId}`,
        );
        return;
      }

      const state = await job.getState();
      if (state !== 'failed') {
        return;
      }

      // Close the DB/Redis observation window before acquiring the atomic
      // BullMQ retry lease. A completed or freshly-mutated row must not move.
      const freshWorkflow = await this.repository.findByTaskId(taskId);
      if (
        !isRecoverableWorkflow(freshWorkflow, cutoff) ||
        !matchesDurableWorkflow(job, freshWorkflow)
      ) {
        return;
      }

      try {
        await job.retry('failed');
        this.logger.log(
          `Stale FINALIZING job returned to BullMQ waiting state | Task: ${taskId}`,
        );
      } catch (error) {
        // Another instance can win the atomic failed->waiting transition after
        // our state read. That is successful recovery, not an operational
        // error. Only a job that remains failed is deferred for the next scan.
        const currentState = await job.getState().catch(() => 'unknown');
        if (currentState !== 'failed' && currentState !== 'unknown') {
          return;
        }
        this.logger.warn(
          `Finalization recovery retry deferred | Task: ${taskId} | Reason: ${safeRecoveryReason(
            error,
          )}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Finalization recovery deferred | Task: ${taskId} | Reason: ${safeRecoveryReason(
          error,
        )}`,
      );
    }
  }
}

function isRecoverableWorkflow(
  workflow: MediaTextVideoWorkflowEntity | null,
  cutoff: Date,
): workflow is MediaTextVideoWorkflowEntity {
  return (
    workflow !== null &&
    workflow.state === 'FINALIZING' &&
    workflow.pipelineMode === 'cascade' &&
    workflow.finalizingAt instanceof Date &&
    Number.isFinite(workflow.finalizingAt.getTime()) &&
    workflow.finalizingAt.getTime() <= cutoff.getTime() &&
    workflow.finalPostId === null &&
    workflow.refundStatus === 'none'
  );
}

function matchesDurableWorkflow(
  job: Job<MediaTextVideoJobData>,
  workflow: MediaTextVideoWorkflowEntity,
): boolean {
  const data = job.data;
  const request = data?.request;
  if (
    String(job.id) !== workflow.taskId ||
    data?.ltxTextPipelineMode !== 'cascade' ||
    data.userId !== workflow.userId ||
    data.chargeId !== workflow.chargeId ||
    !request ||
    typeof request.prompt !== 'string' ||
    (request.contestSubmissionId ?? null) !== workflow.contestSubmissionId
  ) {
    return false;
  }
  const rawPromptSha256 = createHash('sha256')
    .update(request.prompt, 'utf8')
    .digest('hex');
  return rawPromptSha256 === workflow.rawPromptSha256;
}

function safeRecoveryReason(error: unknown): string {
  const reason =
    error &&
    typeof error === 'object' &&
    typeof (error as { reasonCode?: unknown }).reasonCode === 'string'
      ? (error as { reasonCode: string }).reasonCode
      : error instanceof Error
        ? error.message
        : 'FINALIZATION_RECOVERY_FAILED';
  return /^[A-Z][A-Z0-9_]{2,79}$/.test(reason)
    ? reason
    : 'FINALIZATION_RECOVERY_FAILED';
}
