import { In, LessThanOrEqual, Repository } from 'typeorm';
import { TextVideoWorkflowSnapshot } from 'src/modules/media-generation/domain/contracts/text-video-workflow.contract';
import { MediaTextVideoWorkflowEntity } from 'src/modules/media-generation/persistence/entities/media-text-video-workflow.entity';

export type TextVideoWorkflowMutableField =
  | 'state'
  | 'terminalReasonCode'
  | 'refundStatus'
  | 'refundCompletedAt'
  | 'submissionAttemptId'
  | 'stillRequestSha256'
  | 'stillPostDispatchClaimedAt'
  | 'providerPredictionId'
  | 'stillSubmissionAcceptedAt'
  | 'stillReadyAt'
  | 'sourceMime'
  | 'sourceByteLength'
  | 'sourceSha256'
  | 'canonicalMime'
  | 'canonicalByteLength'
  | 'canonicalSha256'
  | 'decodedRgbSha256'
  | 'privateArtifactRef'
  | 'artifactDeleteAfter'
  | 'stillCanonicalizedAt'
  | 'stillQcDecision'
  | 'stillQcReasonCode'
  | 'stillQcCompletedAt'
  | 'i2vRequestSha256'
  | 'i2vDispatchClaimedAt'
  | 'runpodJobId'
  | 'i2vAcceptedAt'
  | 'videoArtifactSha256'
  | 'videoPrivateArtifactRef'
  | 'videoArtifactByteLength'
  | 'videoWidth'
  | 'videoHeight'
  | 'videoHasAudio'
  | 'videoArtifactDeleteAfter'
  | 'videoReadyAt'
  | 'videoQcDecision'
  | 'videoQcReasonCode'
  | 'videoQcCompletedAt'
  | 'finalPostId'
  | 'finalizingAt'
  | 'completedAt'
  | 'failedAt'
  | 'artifactCleanupStatus'
  | 'artifactCleanupAfter'
  | 'artifactCleanupClaimedAt'
  | 'artifactCleanupCompletedAt'
  | 'stillSubmitDurationMs'
  | 'stillPollDurationMs'
  | 'stillDownloadDurationMs'
  | 'stillCanonicalizeDurationMs'
  | 'stillQcDurationMs'
  | 'i2vDurationMs'
  | 'videoQcDurationMs'
  | 'totalDurationMs';

export type TextVideoWorkflowMutation = Pick<
  MediaTextVideoWorkflowEntity,
  'state'
> &
  Partial<
    Pick<
      MediaTextVideoWorkflowEntity,
      Exclude<TextVideoWorkflowMutableField, 'state'>
    >
  >;

export type TextVideoWorkflowCreateResult = {
  workflow: MediaTextVideoWorkflowEntity;
  created: boolean;
};

export type TextVideoWorkflowCasResult =
  | {
      outcome: 'applied';
      workflow: MediaTextVideoWorkflowEntity;
    }
  | {
      outcome: 'conflict';
      workflow: MediaTextVideoWorkflowEntity;
    }
  | {
      outcome: 'not_found';
    };

export interface TextVideoWorkflowRepository {
  createOrLoad(
    snapshot: Readonly<TextVideoWorkflowSnapshot>,
  ): Promise<TextVideoWorkflowCreateResult>;

  findByTaskId(taskId: string): Promise<MediaTextVideoWorkflowEntity | null>;

  findCleanupDue(
    before: Date,
    limit: number,
  ): Promise<MediaTextVideoWorkflowEntity[]>;

  findStaleFinalizing(
    before: Date,
    limit: number,
  ): Promise<MediaTextVideoWorkflowEntity[]>;

  compareAndSwap(params: {
    taskId: string;
    expectedVersion: number;
    expectedStates: readonly MediaTextVideoWorkflowEntity['state'][];
    mutation: Readonly<TextVideoWorkflowMutation>;
  }): Promise<TextVideoWorkflowCasResult>;
}

export type TextVideoWorkflowPersistenceErrorCode =
  | 'TEXT_VIDEO_WORKFLOW_PERSISTENCE_FAILED'
  | 'TEXT_VIDEO_WORKFLOW_MUTATION_INVALID';

export class TextVideoWorkflowPersistenceError extends Error {
  readonly retryable: boolean;

  constructor(readonly reasonCode: TextVideoWorkflowPersistenceErrorCode) {
    super(reasonCode);
    this.name = 'TextVideoWorkflowPersistenceError';
    this.retryable = reasonCode === 'TEXT_VIDEO_WORKFLOW_PERSISTENCE_FAILED';
  }

  toJSON(): {
    reasonCode: TextVideoWorkflowPersistenceErrorCode;
    retryable: boolean;
  } {
    return { reasonCode: this.reasonCode, retryable: this.retryable };
  }
}

/**
 * TypeORM adapter. It is intentionally not registered in the Nest module yet;
 * landing it cannot change the native text-video execution path.
 */
export class TypeOrmTextVideoWorkflowRepository
  implements TextVideoWorkflowRepository
{
  constructor(
    private readonly repository: Repository<MediaTextVideoWorkflowEntity>,
  ) {}

  async createOrLoad(
    snapshot: Readonly<TextVideoWorkflowSnapshot>,
  ): Promise<TextVideoWorkflowCreateResult> {
    const safeSnapshot = pickSafeSnapshot(snapshot);
    try {
      await this.repository.insert({
        ...safeSnapshot,
        state: 'QUEUED',
        version: 0,
        terminalReasonCode: null,
        refundStatus: 'none',
      });
      const workflow = await this.findRequired(safeSnapshot.taskId);
      return { workflow, created: true };
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw persistenceError();
      }
      const workflow = await this.findByTaskId(safeSnapshot.taskId);
      if (!workflow) {
        throw persistenceError();
      }
      return { workflow, created: false };
    }
  }

  async findByTaskId(
    taskId: string,
  ): Promise<MediaTextVideoWorkflowEntity | null> {
    try {
      return await this.repository.findOne({ where: { taskId } });
    } catch {
      throw persistenceError();
    }
  }

  async findCleanupDue(
    before: Date,
    limit: number,
  ): Promise<MediaTextVideoWorkflowEntity[]> {
    if (
      !(before instanceof Date) ||
      !Number.isFinite(before.getTime()) ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 1000
    ) {
      throw new TextVideoWorkflowPersistenceError(
        'TEXT_VIDEO_WORKFLOW_MUTATION_INVALID',
      );
    }
    try {
      const staleClaimBefore = new Date(before.getTime() - 15 * 60_000);
      return await this.repository.find({
        where: [
          {
            artifactCleanupStatus: 'pending',
            artifactCleanupAfter: LessThanOrEqual(before),
          },
          {
            artifactCleanupStatus: 'claimed',
            artifactCleanupClaimedAt: LessThanOrEqual(staleClaimBefore),
          },
        ],
        order: { artifactCleanupAfter: 'ASC', id: 'ASC' },
        take: limit,
      });
    } catch {
      throw persistenceError();
    }
  }

  async findStaleFinalizing(
    before: Date,
    limit: number,
  ): Promise<MediaTextVideoWorkflowEntity[]> {
    assertValidBoundedQuery(before, limit);
    try {
      // FINALIZING has no same-state mutation. Its updatedAt therefore remains
      // the finalization boundary until the row atomically becomes COMPLETED.
      // Querying through the existing (state, updatedAt) index avoids a new
      // migration solely for the recovery scan.
      return await this.repository.find({
        where: {
          state: 'FINALIZING',
          updatedAt: LessThanOrEqual(before),
        },
        order: { updatedAt: 'ASC', id: 'ASC' },
        take: limit,
      });
    } catch {
      throw persistenceError();
    }
  }

  async compareAndSwap(params: {
    taskId: string;
    expectedVersion: number;
    expectedStates: readonly MediaTextVideoWorkflowEntity['state'][];
    mutation: Readonly<TextVideoWorkflowMutation>;
  }): Promise<TextVideoWorkflowCasResult> {
    if (params.expectedStates.length === 0) {
      throw new TextVideoWorkflowPersistenceError(
        'TEXT_VIDEO_WORKFLOW_MUTATION_INVALID',
      );
    }
    const mutation = sanitizeMutation(params.mutation);

    try {
      const result = await this.repository.update(
        {
          taskId: params.taskId,
          version: params.expectedVersion,
          state: In([...params.expectedStates]),
        },
        {
          ...mutation,
          version: params.expectedVersion + 1,
        },
      );
      if (Number(result.affected ?? 0) === 1) {
        return {
          outcome: 'applied',
          workflow: await this.findRequired(params.taskId),
        };
      }
      const workflow = await this.findByTaskId(params.taskId);
      return workflow
        ? { outcome: 'conflict', workflow }
        : { outcome: 'not_found' };
    } catch (error) {
      if (error instanceof TextVideoWorkflowPersistenceError) {
        throw error;
      }
      throw persistenceError();
    }
  }

  private async findRequired(
    taskId: string,
  ): Promise<MediaTextVideoWorkflowEntity> {
    const workflow = await this.findByTaskId(taskId);
    if (!workflow) {
      throw persistenceError();
    }
    return workflow;
  }
}

function assertValidBoundedQuery(before: Date, limit: number): void {
  if (
    !(before instanceof Date) ||
    !Number.isFinite(before.getTime()) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 1000
  ) {
    throw new TextVideoWorkflowPersistenceError(
      'TEXT_VIDEO_WORKFLOW_MUTATION_INVALID',
    );
  }
}

const MUTABLE_FIELDS = new Set<TextVideoWorkflowMutableField>([
  'state',
  'terminalReasonCode',
  'refundStatus',
  'refundCompletedAt',
  'submissionAttemptId',
  'stillRequestSha256',
  'stillPostDispatchClaimedAt',
  'providerPredictionId',
  'stillSubmissionAcceptedAt',
  'stillReadyAt',
  'sourceMime',
  'sourceByteLength',
  'sourceSha256',
  'canonicalMime',
  'canonicalByteLength',
  'canonicalSha256',
  'decodedRgbSha256',
  'privateArtifactRef',
  'artifactDeleteAfter',
  'stillCanonicalizedAt',
  'stillQcDecision',
  'stillQcReasonCode',
  'stillQcCompletedAt',
  'i2vRequestSha256',
  'i2vDispatchClaimedAt',
  'runpodJobId',
  'i2vAcceptedAt',
  'videoArtifactSha256',
  'videoPrivateArtifactRef',
  'videoArtifactByteLength',
  'videoWidth',
  'videoHeight',
  'videoHasAudio',
  'videoArtifactDeleteAfter',
  'videoReadyAt',
  'videoQcDecision',
  'videoQcReasonCode',
  'videoQcCompletedAt',
  'finalPostId',
  'finalizingAt',
  'completedAt',
  'failedAt',
  'artifactCleanupStatus',
  'artifactCleanupAfter',
  'artifactCleanupClaimedAt',
  'artifactCleanupCompletedAt',
  'stillSubmitDurationMs',
  'stillPollDurationMs',
  'stillDownloadDurationMs',
  'stillCanonicalizeDurationMs',
  'stillQcDurationMs',
  'i2vDurationMs',
  'videoQcDurationMs',
  'totalDurationMs',
]);

function sanitizeMutation(
  candidate: Readonly<TextVideoWorkflowMutation>,
): TextVideoWorkflowMutation {
  if (!candidate || typeof candidate !== 'object') {
    throw new TextVideoWorkflowPersistenceError(
      'TEXT_VIDEO_WORKFLOW_MUTATION_INVALID',
    );
  }
  const keys = Object.keys(candidate);
  if (
    !keys.includes('state') ||
    keys.some(
      (key) => !MUTABLE_FIELDS.has(key as TextVideoWorkflowMutableField),
    )
  ) {
    throw new TextVideoWorkflowPersistenceError(
      'TEXT_VIDEO_WORKFLOW_MUTATION_INVALID',
    );
  }
  return Object.fromEntries(
    Object.entries(candidate).filter(([, value]) => value !== undefined),
  ) as TextVideoWorkflowMutation;
}

function pickSafeSnapshot(
  snapshot: Readonly<TextVideoWorkflowSnapshot>,
): TextVideoWorkflowSnapshot {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new TextVideoWorkflowPersistenceError(
      'TEXT_VIDEO_WORKFLOW_MUTATION_INVALID',
    );
  }
  return {
    taskId: snapshot.taskId,
    userId: snapshot.userId,
    chargeId: snapshot.chargeId,
    contestSubmissionId: snapshot.contestSubmissionId,
    pipelineMode: snapshot.pipelineMode,
    pipelineConfigVersion: snapshot.pipelineConfigVersion,
    prunaClientPolicySha256: snapshot.prunaClientPolicySha256,
    promptCompilerVersion: snapshot.promptCompilerVersion,
    stillQcPolicyVersion: snapshot.stillQcPolicyVersion,
    videoQcPolicyVersion: snapshot.videoQcPolicyVersion,
    cascadeRunpodEndpointId: snapshot.cascadeRunpodEndpointId,
    cascadeRunpodApiKeyConfigKey: snapshot.cascadeRunpodApiKeyConfigKey,
    artifactTtlMs: snapshot.artifactTtlMs,
    stillPollIntervalMs: snapshot.stillPollIntervalMs,
    stillTotalTimeoutMs: snapshot.stillTotalTimeoutMs,
    i2vPollIntervalMs: snapshot.i2vPollIntervalMs,
    i2vTotalTimeoutMs: snapshot.i2vTotalTimeoutMs,
    rawPromptSha256: snapshot.rawPromptSha256,
    stillPromptSha256: snapshot.stillPromptSha256,
    motionPromptSha256: snapshot.motionPromptSha256,
    width: snapshot.width,
    height: snapshot.height,
    frames: snapshot.frames,
    fps: snapshot.fps,
    stillSeed: snapshot.stillSeed,
    videoSeed: snapshot.videoSeed,
    stillProvider: snapshot.stillProvider,
    stillModel: snapshot.stillModel,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  const errno = (error as { errno?: unknown }).errno;
  return (
    code === 'ER_DUP_ENTRY' ||
    code === 'SQLITE_CONSTRAINT' ||
    code === '23505' ||
    errno === 1062
  );
}

function persistenceError(): TextVideoWorkflowPersistenceError {
  return new TextVideoWorkflowPersistenceError(
    'TEXT_VIDEO_WORKFLOW_PERSISTENCE_FAILED',
  );
}
