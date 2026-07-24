import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MediaTextVideoWorkflowEntity } from 'src/modules/media-generation/persistence/entities/media-text-video-workflow.entity';
import {
  asPrivateStillArtifactRef,
  PrunaStillArtifactStore,
} from 'src/modules/media-generation/infrastructure/providers/pruna/pruna-still-artifact.store';
import {
  StagedCascadeVideo,
  TEXT_VIDEO_I2V_PROVIDER,
  TEXT_VIDEO_PRIVATE_ARTIFACT_STORE,
  TEXT_VIDEO_WORKFLOW_REPOSITORY,
  TEXT_VIDEO_WORKFLOW_STATE_MACHINE,
  TextVideoI2vProviderPort,
} from './text-video-pipeline.ports';
import { TextVideoWorkflowRepository } from './text-video-workflow.repository';
import { TextVideoWorkflowService } from './text-video-workflow.service';

const CLEANUP_BATCH_SIZE = 25;
const CLEANUP_RETRY_DELAY_MS = 5 * 60_000;

/**
 * Durable best-effort cleanup for terminal cascade checkpoints. The persisted
 * claim makes overlapping cron runs safe. Nonterminal and FINALIZING workflows
 * are deliberately left for workflow reconciliation, never deleted/refunded by
 * a storage janitor.
 */
@Injectable()
export class TextVideoArtifactReaperService {
  private readonly logger = new Logger(TextVideoArtifactReaperService.name);

  constructor(
    @Inject(TEXT_VIDEO_WORKFLOW_REPOSITORY)
    private readonly repository: TextVideoWorkflowRepository,
    @Inject(TEXT_VIDEO_WORKFLOW_STATE_MACHINE)
    private readonly workflows: TextVideoWorkflowService,
    @Inject(TEXT_VIDEO_PRIVATE_ARTIFACT_STORE)
    private readonly stillStore: PrunaStillArtifactStore,
    @Inject(TEXT_VIDEO_I2V_PROVIDER)
    private readonly videoProvider: TextVideoI2vProviderPort,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async reapDueArtifacts(): Promise<void> {
    const due = await this.repository.findCleanupDue(
      new Date(),
      CLEANUP_BATCH_SIZE,
    );
    for (const workflow of due) {
      if (workflow.state !== 'COMPLETED' && workflow.state !== 'FAILED') {
        continue;
      }
      await this.cleanupOne(workflow);
    }
  }

  private async cleanupOne(
    candidate: MediaTextVideoWorkflowEntity,
  ): Promise<void> {
    let claimed: MediaTextVideoWorkflowEntity | null = null;
    try {
      claimed = await this.workflows.claimArtifactCleanup(
        candidate.taskId,
        candidate.version,
      );
      if (claimed.privateArtifactRef) {
        await this.stillStore.deleteCanonicalPng(
          asPrivateStillArtifactRef(claimed.privateArtifactRef),
        );
      }
      if (claimed.videoPrivateArtifactRef) {
        await this.videoProvider.deleteStaged(videoArtifact(claimed));
      }
      await this.workflows.completeArtifactCleanup(
        claimed.taskId,
        claimed.version,
      );
    } catch (error) {
      if (claimed) {
        await this.workflows
          .releaseArtifactCleanup({
            taskId: claimed.taskId,
            expectedVersion: claimed.version,
            retryAfter: new Date(Date.now() + CLEANUP_RETRY_DELAY_MS),
          })
          .catch(() => undefined);
      }
      this.logger.warn(
        `Artifact cleanup deferred | Task: ${candidate.taskId} | Reason: ${safeCleanupReason(
          error,
        )}`,
      );
    }
  }
}

function videoArtifact(
  workflow: MediaTextVideoWorkflowEntity,
): StagedCascadeVideo {
  if (
    !workflow.videoPrivateArtifactRef ||
    !workflow.videoArtifactSha256 ||
    !workflow.videoArtifactByteLength
  ) {
    throw new Error('VIDEO_STAGE_DESCRIPTOR_INVALID');
  }
  return {
    privateArtifactRef: workflow.videoPrivateArtifactRef,
    artifactSha256: workflow.videoArtifactSha256,
    byteLength: workflow.videoArtifactByteLength,
    width: workflow.videoWidth,
    height: workflow.videoHeight,
    hasAudio: workflow.videoHasAudio,
  };
}

function safeCleanupReason(error: unknown): string {
  const reason =
    error &&
    typeof error === 'object' &&
    typeof (error as { reasonCode?: unknown }).reasonCode === 'string'
      ? (error as { reasonCode: string }).reasonCode
      : error instanceof Error
        ? error.message
        : 'CLEANUP_FAILED';
  return /^[A-Z][A-Z0-9_]{2,79}$/.test(reason) ? reason : 'CLEANUP_FAILED';
}
