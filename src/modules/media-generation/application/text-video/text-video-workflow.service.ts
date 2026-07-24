import {
  TextVideoWorkflowQcDecision,
  TextVideoWorkflowResumeAction,
  TextVideoWorkflowSnapshot,
  TextVideoWorkflowState,
} from 'src/modules/media-generation/domain/contracts/text-video-workflow.contract';
import { LTX_TEXT_CASCADE_RUNPOD_API_KEY_CONFIG_KEY } from 'src/modules/media-generation/domain/contracts/text-video-cascade-settings.contract';
import { MediaTextVideoWorkflowEntity } from 'src/modules/media-generation/persistence/entities/media-text-video-workflow.entity';
import {
  TextVideoWorkflowCasResult,
  TextVideoWorkflowMutation,
  TextVideoWorkflowRepository,
} from './text-video-workflow.repository';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const SAFE_ENDPOINT_ID_PATTERN = /^[A-Za-z0-9_-]{3,128}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_VERSION_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_REASON_PATTERN = /^[A-Z][A-Z0-9_]{2,79}$/;
const PRIVATE_ARTIFACT_REF_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;
const PRIVATE_VIDEO_ARTIFACT_REF_PATTERN = /^video_stage_[a-f0-9]{64}$/;
const MAX_ARTIFACT_BYTES = 6 * 1024 * 1024;
const MAX_VIDEO_ARTIFACT_BYTES = 300 * 1024 * 1024;
const MAX_DURATION_MS = 4_294_967_295;
const ARTIFACT_CLEANUP_CLAIM_TTL_MS = 15 * 60_000;
const SNAPSHOT_KEYS = [
  'taskId',
  'userId',
  'chargeId',
  'contestSubmissionId',
  'pipelineMode',
  'pipelineConfigVersion',
  'prunaClientPolicySha256',
  'promptCompilerVersion',
  'stillQcPolicyVersion',
  'videoQcPolicyVersion',
  'cascadeRunpodEndpointId',
  'cascadeRunpodApiKeyConfigKey',
  'artifactTtlMs',
  'stillPollIntervalMs',
  'stillTotalTimeoutMs',
  'i2vPollIntervalMs',
  'i2vTotalTimeoutMs',
  'rawPromptSha256',
  'stillPromptSha256',
  'motionPromptSha256',
  'width',
  'height',
  'frames',
  'fps',
  'stillSeed',
  'videoSeed',
  'stillProvider',
  'stillModel',
] as const;
const CANONICAL_ARTIFACT_KEYS = [
  'sourceMime',
  'sourceByteLength',
  'sourceSha256',
  'canonicalMime',
  'canonicalByteLength',
  'canonicalSha256',
  'decodedRgbSha256',
  'privateArtifactRef',
  'artifactDeleteAfter',
  'stillDownloadDurationMs',
  'stillCanonicalizeDurationMs',
] as const;

export type TextVideoWorkflowErrorCode =
  | 'TEXT_VIDEO_WORKFLOW_INVALID_INPUT'
  | 'TEXT_VIDEO_WORKFLOW_NOT_FOUND'
  | 'TEXT_VIDEO_WORKFLOW_SNAPSHOT_CONFLICT'
  | 'TEXT_VIDEO_WORKFLOW_VERSION_CONFLICT'
  | 'TEXT_VIDEO_WORKFLOW_INVALID_TRANSITION'
  | 'TEXT_VIDEO_WORKFLOW_INVARIANT_MISMATCH'
  | 'TEXT_VIDEO_WORKFLOW_NO_RESUBMIT';

export class TextVideoWorkflowError extends Error {
  constructor(readonly reasonCode: TextVideoWorkflowErrorCode) {
    super(reasonCode);
    this.name = 'TextVideoWorkflowError';
  }

  toJSON(): { reasonCode: TextVideoWorkflowErrorCode } {
    return { reasonCode: this.reasonCode };
  }
}

export interface CanonicalStillAdoption {
  sourceMime: 'image/jpeg';
  sourceByteLength: number;
  sourceSha256: string;
  canonicalMime: 'image/png';
  canonicalByteLength: number;
  canonicalSha256: string;
  decodedRgbSha256: string;
  privateArtifactRef: string;
  artifactDeleteAfter: Date;
  stillDownloadDurationMs: number;
  stillCanonicalizeDurationMs: number;
}

export interface TextVideoWorkflowResumeDirective {
  action: TextVideoWorkflowResumeAction;
  workflow: MediaTextVideoWorkflowEntity;
  idempotencyKey?: string;
}

export type SubmissionDispatchClaim =
  | {
      disposition: 'submit_once';
      workflow: MediaTextVideoWorkflowEntity;
    }
  | {
      disposition: 'do_not_submit';
      workflow: MediaTextVideoWorkflowEntity;
      reasonCode: 'TEXT_VIDEO_WORKFLOW_NO_RESUBMIT';
    };

export interface FinalizationClaim {
  disposition: 'finalize_idempotently' | 'already_completed';
  idempotencyKey: string;
  workflow: MediaTextVideoWorkflowEntity;
}

/**
 * Durable cascade state machine. It has no provider dependencies and performs
 * no external I/O; each mutation is one optimistic compare-and-swap.
 */
export class TextVideoWorkflowService {
  constructor(
    private readonly repository: TextVideoWorkflowRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createOrLoad(
    snapshot: Readonly<TextVideoWorkflowSnapshot>,
  ): Promise<MediaTextVideoWorkflowEntity> {
    validateSnapshot(snapshot);
    const result = await this.repository.createOrLoad(snapshot);
    if (!snapshotMatches(result.workflow, snapshot)) {
      throw workflowError('TEXT_VIDEO_WORKFLOW_SNAPSHOT_CONFLICT');
    }
    return result.workflow;
  }

  getByTaskId(taskId: string): Promise<MediaTextVideoWorkflowEntity> {
    return this.requireWorkflow(taskId);
  }

  async advancePlanning(
    taskId: string,
    expectedVersion: number,
    targetState: 'COMPILING' | 'PLANNED',
  ): Promise<MediaTextVideoWorkflowEntity> {
    const expectedState: TextVideoWorkflowState =
      targetState === 'COMPILING' ? 'QUEUED' : 'COMPILING';
    return this.transition({
      taskId,
      expectedVersion,
      expectedStates: [expectedState],
      mutation: { state: targetState },
      idempotent: (workflow) => workflow.state === targetState,
    });
  }

  async prepareStillSubmission(params: {
    taskId: string;
    expectedVersion: number;
    submissionAttemptId: string;
    stillRequestSha256: string;
  }): Promise<MediaTextVideoWorkflowEntity> {
    assertUuid(params.submissionAttemptId);
    assertSha256(params.stillRequestSha256);
    const existing = await this.requireWorkflow(params.taskId);
    assertCascade(existing);

    if (
      existing.submissionAttemptId !== null ||
      existing.stillRequestSha256 !== null
    ) {
      assertSame(
        existing.submissionAttemptId === params.submissionAttemptId &&
          existing.stillRequestSha256 === params.stillRequestSha256,
      );
      return existing;
    }

    return this.transitionLoaded(existing, {
      expectedVersion: params.expectedVersion,
      expectedStates: ['PLANNED'],
      mutation: {
        state: 'STILL_SUBMITTING',
        submissionAttemptId: params.submissionAttemptId,
        stillRequestSha256: params.stillRequestSha256,
        stillPostDispatchClaimedAt: null,
      },
      idempotent: (workflow) => {
        if (workflow.submissionAttemptId === null) {
          return false;
        }
        assertSame(
          workflow.submissionAttemptId === params.submissionAttemptId &&
            workflow.stillRequestSha256 === params.stillRequestSha256,
        );
        return true;
      },
    });
  }

  async claimStillSubmissionDispatch(params: {
    taskId: string;
    expectedVersion: number;
    submissionAttemptId: string;
  }): Promise<SubmissionDispatchClaim> {
    assertUuid(params.submissionAttemptId);
    const existing = await this.requireWorkflow(params.taskId);
    assertCascade(existing);
    assertSame(existing.submissionAttemptId === params.submissionAttemptId);

    if (
      existing.state !== 'STILL_SUBMITTING' ||
      existing.stillPostDispatchClaimedAt !== null
    ) {
      return {
        disposition: 'do_not_submit',
        workflow: existing,
        reasonCode: 'TEXT_VIDEO_WORKFLOW_NO_RESUBMIT',
      };
    }
    assertVersion(existing, params.expectedVersion);

    const result = await this.repository.compareAndSwap({
      taskId: params.taskId,
      expectedVersion: params.expectedVersion,
      expectedStates: ['STILL_SUBMITTING'],
      mutation: {
        state: 'STILL_SUBMITTING',
        stillPostDispatchClaimedAt: this.safeNow(),
      },
    });
    if (result.outcome === 'applied') {
      return { disposition: 'submit_once', workflow: result.workflow };
    }
    if (
      result.outcome === 'conflict' &&
      result.workflow.submissionAttemptId === params.submissionAttemptId &&
      (result.workflow.stillPostDispatchClaimedAt !== null ||
        result.workflow.state !== 'STILL_SUBMITTING')
    ) {
      return {
        disposition: 'do_not_submit',
        workflow: result.workflow,
        reasonCode: 'TEXT_VIDEO_WORKFLOW_NO_RESUBMIT',
      };
    }
    throwCasError(result);
  }

  async recordStillSubmissionAccepted(params: {
    taskId: string;
    expectedVersion: number;
    submissionAttemptId: string;
    predictionId: string;
    stillSubmitDurationMs: number;
  }): Promise<MediaTextVideoWorkflowEntity> {
    assertUuid(params.submissionAttemptId);
    assertProviderId(params.predictionId);
    assertDuration(params.stillSubmitDurationMs);
    const existing = await this.requireWorkflow(params.taskId);
    assertCascade(existing);
    assertSame(existing.submissionAttemptId === params.submissionAttemptId);

    if (existing.providerPredictionId !== null) {
      assertSame(existing.providerPredictionId === params.predictionId);
      return existing;
    }
    if (
      existing.state !== 'STILL_SUBMITTING' ||
      existing.stillPostDispatchClaimedAt === null
    ) {
      throw workflowError('TEXT_VIDEO_WORKFLOW_NO_RESUBMIT');
    }

    return this.transitionLoaded(existing, {
      expectedVersion: params.expectedVersion,
      expectedStates: ['STILL_SUBMITTING'],
      mutation: {
        state: 'STILL_RUNNING',
        providerPredictionId: params.predictionId,
        stillSubmissionAcceptedAt: this.safeNow(),
        stillSubmitDurationMs: params.stillSubmitDurationMs,
      },
      idempotent: (workflow) => {
        if (workflow.providerPredictionId === null) {
          return false;
        }
        assertSame(workflow.providerPredictionId === params.predictionId);
        return true;
      },
    });
  }

  async recordStillSubmissionUncertain(params: {
    taskId: string;
    expectedVersion: number;
    submissionAttemptId: string;
  }): Promise<MediaTextVideoWorkflowEntity> {
    assertUuid(params.submissionAttemptId);
    const existing = await this.requireWorkflow(params.taskId);
    assertSame(existing.submissionAttemptId === params.submissionAttemptId);
    if (existing.state === 'STILL_SUBMISSION_UNCERTAIN') {
      return existing;
    }
    if (
      existing.providerPredictionId !== null ||
      existing.state !== 'STILL_SUBMITTING' ||
      existing.stillPostDispatchClaimedAt === null
    ) {
      throw workflowError('TEXT_VIDEO_WORKFLOW_INVALID_TRANSITION');
    }
    return this.transitionLoaded(existing, {
      expectedVersion: params.expectedVersion,
      expectedStates: ['STILL_SUBMITTING'],
      mutation: {
        state: 'STILL_SUBMISSION_UNCERTAIN',
        terminalReasonCode: 'PRUNA_SUBMISSION_UNCERTAIN',
      },
      idempotent: (workflow) => workflow.state === 'STILL_SUBMISSION_UNCERTAIN',
    });
  }

  async markStillReady(params: {
    taskId: string;
    expectedVersion: number;
    stillPollDurationMs: number;
  }): Promise<MediaTextVideoWorkflowEntity> {
    assertDuration(params.stillPollDurationMs);
    return this.transition({
      taskId: params.taskId,
      expectedVersion: params.expectedVersion,
      expectedStates: ['STILL_RUNNING'],
      mutation: {
        state: 'STILL_READY',
        stillReadyAt: this.safeNow(),
        stillPollDurationMs: params.stillPollDurationMs,
      },
      idempotent: (workflow) => workflow.stillReadyAt !== null,
    });
  }

  async adoptCanonicalArtifact(params: {
    taskId: string;
    expectedVersion: number;
    artifact: Readonly<CanonicalStillAdoption>;
  }): Promise<MediaTextVideoWorkflowEntity> {
    validateCanonicalArtifact(params.artifact);
    const existing = await this.requireWorkflow(params.taskId);
    if (existing.privateArtifactRef !== null) {
      assertArtifactMatches(existing, params.artifact);
      return existing;
    }
    return this.transitionLoaded(existing, {
      expectedVersion: params.expectedVersion,
      expectedStates: ['STILL_READY'],
      mutation: {
        state: 'STILL_CANONICALIZED',
        sourceMime: params.artifact.sourceMime,
        sourceByteLength: params.artifact.sourceByteLength,
        sourceSha256: params.artifact.sourceSha256,
        canonicalMime: params.artifact.canonicalMime,
        canonicalByteLength: params.artifact.canonicalByteLength,
        canonicalSha256: params.artifact.canonicalSha256,
        decodedRgbSha256: params.artifact.decodedRgbSha256,
        privateArtifactRef: params.artifact.privateArtifactRef,
        artifactDeleteAfter: params.artifact.artifactDeleteAfter,
        artifactCleanupStatus: 'pending',
        artifactCleanupAfter: params.artifact.artifactDeleteAfter,
        stillCanonicalizedAt: this.safeNow(),
        stillDownloadDurationMs: params.artifact.stillDownloadDurationMs,
        stillCanonicalizeDurationMs:
          params.artifact.stillCanonicalizeDurationMs,
      },
      idempotent: (workflow) => {
        if (workflow.privateArtifactRef === null) {
          return false;
        }
        assertArtifactMatches(workflow, params.artifact);
        return true;
      },
    });
  }

  beginStillQc(
    taskId: string,
    expectedVersion: number,
  ): Promise<MediaTextVideoWorkflowEntity> {
    return this.transition({
      taskId,
      expectedVersion,
      expectedStates: ['STILL_CANONICALIZED'],
      mutation: { state: 'STILL_QC' },
      idempotent: (workflow) => workflow.state === 'STILL_QC',
    });
  }

  async recordStillQc(params: {
    taskId: string;
    expectedVersion: number;
    decision: TextVideoWorkflowQcDecision;
    reasonCode: string | null;
    durationMs: number;
  }): Promise<MediaTextVideoWorkflowEntity> {
    validateQc(params.decision, params.reasonCode);
    assertDuration(params.durationMs);
    const existing = await this.requireWorkflow(params.taskId);
    if (existing.stillQcDecision !== null) {
      assertSame(
        existing.stillQcDecision === params.decision &&
          existing.stillQcReasonCode === params.reasonCode,
      );
      return existing;
    }
    const passed = params.decision === 'pass';
    return this.transitionLoaded(existing, {
      expectedVersion: params.expectedVersion,
      expectedStates: ['STILL_QC'],
      mutation: passed
        ? {
            state: 'STILL_ACCEPTED',
            stillQcDecision: params.decision,
            stillQcReasonCode: null,
            stillQcCompletedAt: this.safeNow(),
            stillQcDurationMs: params.durationMs,
          }
        : {
            state: 'FAILED',
            stillQcDecision: params.decision,
            stillQcReasonCode: params.reasonCode,
            stillQcCompletedAt: this.safeNow(),
            stillQcDurationMs: params.durationMs,
            terminalReasonCode: params.reasonCode || 'STILL_QC_REJECTED',
            refundStatus: 'required',
            failedAt: this.safeNow(),
            artifactCleanupStatus: 'pending',
            artifactCleanupAfter: this.safeNow(),
          },
      idempotent: (workflow) => {
        if (workflow.stillQcDecision === null) {
          return false;
        }
        assertSame(
          workflow.stillQcDecision === params.decision &&
            workflow.stillQcReasonCode === params.reasonCode,
        );
        return true;
      },
    });
  }

  async prepareI2vSubmission(params: {
    taskId: string;
    expectedVersion: number;
    i2vRequestSha256: string;
  }): Promise<MediaTextVideoWorkflowEntity> {
    assertSha256(params.i2vRequestSha256);
    const existing = await this.requireWorkflow(params.taskId);
    if (existing.i2vRequestSha256 !== null) {
      assertSame(existing.i2vRequestSha256 === params.i2vRequestSha256);
      return existing;
    }
    return this.transitionLoaded(existing, {
      expectedVersion: params.expectedVersion,
      expectedStates: ['STILL_ACCEPTED'],
      mutation: {
        state: 'I2V_SUBMITTING',
        i2vRequestSha256: params.i2vRequestSha256,
        i2vDispatchClaimedAt: null,
      },
      idempotent: (workflow) => {
        if (workflow.i2vRequestSha256 === null) {
          return false;
        }
        assertSame(workflow.i2vRequestSha256 === params.i2vRequestSha256);
        return true;
      },
    });
  }

  async claimI2vSubmissionDispatch(params: {
    taskId: string;
    expectedVersion: number;
    i2vRequestSha256: string;
  }): Promise<SubmissionDispatchClaim> {
    assertSha256(params.i2vRequestSha256);
    const existing = await this.requireWorkflow(params.taskId);
    assertSame(existing.i2vRequestSha256 === params.i2vRequestSha256);
    if (
      existing.state !== 'I2V_SUBMITTING' ||
      existing.i2vDispatchClaimedAt !== null
    ) {
      return {
        disposition: 'do_not_submit',
        workflow: existing,
        reasonCode: 'TEXT_VIDEO_WORKFLOW_NO_RESUBMIT',
      };
    }
    assertVersion(existing, params.expectedVersion);
    const result = await this.repository.compareAndSwap({
      taskId: params.taskId,
      expectedVersion: params.expectedVersion,
      expectedStates: ['I2V_SUBMITTING'],
      mutation: {
        state: 'I2V_SUBMITTING',
        i2vDispatchClaimedAt: this.safeNow(),
      },
    });
    if (result.outcome === 'applied') {
      return { disposition: 'submit_once', workflow: result.workflow };
    }
    if (
      result.outcome === 'conflict' &&
      result.workflow.i2vRequestSha256 === params.i2vRequestSha256 &&
      (result.workflow.i2vDispatchClaimedAt !== null ||
        result.workflow.state !== 'I2V_SUBMITTING')
    ) {
      return {
        disposition: 'do_not_submit',
        workflow: result.workflow,
        reasonCode: 'TEXT_VIDEO_WORKFLOW_NO_RESUBMIT',
      };
    }
    throwCasError(result);
  }

  async adoptRunpodJob(params: {
    taskId: string;
    expectedVersion: number;
    i2vRequestSha256: string;
    runpodJobId: string;
  }): Promise<MediaTextVideoWorkflowEntity> {
    assertSha256(params.i2vRequestSha256);
    assertProviderId(params.runpodJobId);
    const existing = await this.requireWorkflow(params.taskId);
    assertSame(existing.i2vRequestSha256 === params.i2vRequestSha256);
    if (existing.runpodJobId !== null) {
      assertSame(existing.runpodJobId === params.runpodJobId);
      return existing;
    }
    if (
      existing.state !== 'I2V_SUBMITTING' ||
      existing.i2vDispatchClaimedAt === null
    ) {
      throw workflowError('TEXT_VIDEO_WORKFLOW_NO_RESUBMIT');
    }
    return this.transitionLoaded(existing, {
      expectedVersion: params.expectedVersion,
      expectedStates: ['I2V_SUBMITTING'],
      mutation: {
        state: 'I2V_RUNNING',
        runpodJobId: params.runpodJobId,
        i2vAcceptedAt: this.safeNow(),
      },
      idempotent: (workflow) => {
        if (workflow.runpodJobId === null) {
          return false;
        }
        assertSame(workflow.runpodJobId === params.runpodJobId);
        return true;
      },
    });
  }

  async markVideoReady(params: {
    taskId: string;
    expectedVersion: number;
    videoArtifactSha256: string;
    videoPrivateArtifactRef: string;
    videoArtifactByteLength: number;
    videoWidth: number | null;
    videoHeight: number | null;
    videoHasAudio: boolean | null;
    videoArtifactDeleteAfter: Date;
    i2vDurationMs: number;
  }): Promise<MediaTextVideoWorkflowEntity> {
    assertSha256(params.videoArtifactSha256);
    assertPrivateVideoArtifact(params);
    assertDuration(params.i2vDurationMs);
    const existing = await this.requireWorkflow(params.taskId);
    if (existing.videoArtifactSha256 !== null) {
      assertVideoArtifactMatches(existing, params);
      return existing;
    }
    return this.transitionLoaded(existing, {
      expectedVersion: params.expectedVersion,
      expectedStates: ['I2V_RUNNING'],
      mutation: {
        state: 'VIDEO_READY',
        videoArtifactSha256: params.videoArtifactSha256,
        videoPrivateArtifactRef: params.videoPrivateArtifactRef,
        videoArtifactByteLength: params.videoArtifactByteLength,
        videoWidth: params.videoWidth,
        videoHeight: params.videoHeight,
        videoHasAudio: params.videoHasAudio,
        videoArtifactDeleteAfter: params.videoArtifactDeleteAfter,
        videoReadyAt: this.safeNow(),
        i2vDurationMs: params.i2vDurationMs,
        artifactCleanupStatus: 'pending',
        artifactCleanupAfter: earliestDate(
          existing.artifactCleanupAfter,
          params.videoArtifactDeleteAfter,
        ),
      },
      idempotent: (workflow) => {
        if (workflow.videoArtifactSha256 === null) {
          return false;
        }
        assertVideoArtifactMatches(workflow, params);
        return true;
      },
    });
  }

  beginVideoQc(
    taskId: string,
    expectedVersion: number,
  ): Promise<MediaTextVideoWorkflowEntity> {
    return this.transition({
      taskId,
      expectedVersion,
      expectedStates: ['VIDEO_READY'],
      mutation: { state: 'VIDEO_QC' },
      idempotent: (workflow) => workflow.state === 'VIDEO_QC',
    });
  }

  async recordVideoQc(params: {
    taskId: string;
    expectedVersion: number;
    decision: TextVideoWorkflowQcDecision;
    reasonCode: string | null;
    durationMs: number;
  }): Promise<MediaTextVideoWorkflowEntity> {
    validateQc(params.decision, params.reasonCode);
    assertDuration(params.durationMs);
    const existing = await this.requireWorkflow(params.taskId);
    if (existing.videoQcDecision !== null) {
      assertSame(
        existing.videoQcDecision === params.decision &&
          existing.videoQcReasonCode === params.reasonCode,
      );
      return existing;
    }
    const passed = params.decision === 'pass';
    return this.transitionLoaded(existing, {
      expectedVersion: params.expectedVersion,
      expectedStates: ['VIDEO_QC'],
      mutation: passed
        ? {
            state: 'VIDEO_ACCEPTED',
            videoQcDecision: params.decision,
            videoQcReasonCode: null,
            videoQcCompletedAt: this.safeNow(),
            videoQcDurationMs: params.durationMs,
          }
        : {
            state: 'FAILED',
            videoQcDecision: params.decision,
            videoQcReasonCode: params.reasonCode,
            videoQcCompletedAt: this.safeNow(),
            videoQcDurationMs: params.durationMs,
            terminalReasonCode: params.reasonCode || 'VIDEO_QC_REJECTED',
            refundStatus: 'required',
            failedAt: this.safeNow(),
            artifactCleanupStatus: 'pending',
            artifactCleanupAfter: this.safeNow(),
          },
      idempotent: (workflow) => {
        if (workflow.videoQcDecision === null) {
          return false;
        }
        assertSame(
          workflow.videoQcDecision === params.decision &&
            workflow.videoQcReasonCode === params.reasonCode,
        );
        return true;
      },
    });
  }

  async claimFinalization(
    taskId: string,
    expectedVersion: number,
  ): Promise<FinalizationClaim> {
    const existing = await this.requireWorkflow(taskId);
    if (existing.state === 'COMPLETED') {
      return {
        disposition: 'already_completed',
        idempotencyKey: existing.taskId,
        workflow: existing,
      };
    }
    if (existing.state === 'FINALIZING') {
      return {
        disposition: 'finalize_idempotently',
        idempotencyKey: existing.taskId,
        workflow: existing,
      };
    }
    const workflow = await this.transitionLoaded(existing, {
      expectedVersion,
      expectedStates: ['VIDEO_ACCEPTED'],
      mutation: {
        state: 'FINALIZING',
        finalizingAt: this.safeNow(),
      },
      idempotent: (candidate) => candidate.state === 'FINALIZING',
    });
    return {
      disposition: 'finalize_idempotently',
      idempotencyKey: workflow.taskId,
      workflow,
    };
  }

  async completeFinalization(params: {
    taskId: string;
    expectedVersion: number;
    finalPostId: number;
    totalDurationMs: number;
  }): Promise<MediaTextVideoWorkflowEntity> {
    assertPositiveInteger(params.finalPostId);
    assertDuration(params.totalDurationMs);
    const existing = await this.requireWorkflow(params.taskId);
    if (existing.finalPostId !== null || existing.state === 'COMPLETED') {
      assertSame(
        existing.state === 'COMPLETED' &&
          existing.finalPostId === params.finalPostId,
      );
      return existing;
    }
    return this.transitionLoaded(existing, {
      expectedVersion: params.expectedVersion,
      expectedStates: ['FINALIZING'],
      mutation: {
        state: 'COMPLETED',
        finalPostId: params.finalPostId,
        completedAt: this.safeNow(),
        totalDurationMs: params.totalDurationMs,
        refundStatus: 'none',
        terminalReasonCode: null,
        artifactCleanupStatus: 'pending',
        artifactCleanupAfter: this.safeNow(),
      },
      idempotent: (workflow) => {
        if (workflow.finalPostId === null) {
          return false;
        }
        assertSame(
          workflow.state === 'COMPLETED' &&
            workflow.finalPostId === params.finalPostId,
        );
        return true;
      },
    });
  }

  async failWorkflow(params: {
    taskId: string;
    expectedVersion: number;
    reasonCode: string;
    totalDurationMs?: number;
  }): Promise<MediaTextVideoWorkflowEntity> {
    assertReason(params.reasonCode);
    if (params.totalDurationMs !== undefined) {
      assertDuration(params.totalDurationMs);
    }
    const existing = await this.requireWorkflow(params.taskId);
    if (existing.state === 'FAILED') {
      assertSame(existing.terminalReasonCode === params.reasonCode);
      return existing;
    }
    if (existing.state === 'COMPLETED' || existing.state === 'FINALIZING') {
      throw workflowError('TEXT_VIDEO_WORKFLOW_INVALID_TRANSITION');
    }
    return this.transitionLoaded(existing, {
      expectedVersion: params.expectedVersion,
      expectedStates: [existing.state],
      mutation: {
        state: 'FAILED',
        terminalReasonCode: params.reasonCode,
        refundStatus: 'required',
        failedAt: this.safeNow(),
        artifactCleanupStatus:
          existing.privateArtifactRef !== null ||
          existing.videoPrivateArtifactRef !== null
            ? 'pending'
            : 'not_required',
        artifactCleanupAfter:
          existing.privateArtifactRef !== null ||
          existing.videoPrivateArtifactRef !== null
            ? this.safeNow()
            : null,
        ...(params.totalDurationMs !== undefined
          ? { totalDurationMs: params.totalDurationMs }
          : {}),
      },
      idempotent: (workflow) => {
        if (workflow.state !== 'FAILED') {
          return false;
        }
        assertSame(workflow.terminalReasonCode === params.reasonCode);
        return true;
      },
    });
  }

  async markRefundCompleted(
    taskId: string,
    expectedVersion: number,
  ): Promise<MediaTextVideoWorkflowEntity> {
    const existing = await this.requireWorkflow(taskId);
    if (existing.state === 'FAILED' && existing.refundStatus === 'completed') {
      return existing;
    }
    if (
      existing.state !== 'FAILED' ||
      existing.refundStatus !== 'required' ||
      existing.finalPostId !== null
    ) {
      throw workflowError('TEXT_VIDEO_WORKFLOW_INVALID_TRANSITION');
    }
    return this.transitionLoaded(existing, {
      expectedVersion,
      expectedStates: ['FAILED'],
      mutation: {
        state: 'FAILED',
        refundStatus: 'completed',
        refundCompletedAt: this.safeNow(),
      },
      idempotent: (workflow) =>
        workflow.state === 'FAILED' && workflow.refundStatus === 'completed',
    });
  }

  async claimArtifactCleanup(
    taskId: string,
    expectedVersion: number,
  ): Promise<MediaTextVideoWorkflowEntity> {
    const existing = await this.requireWorkflow(taskId);
    const now = this.safeNow();
    const pendingDue =
      existing.artifactCleanupStatus === 'pending' &&
      existing.artifactCleanupAfter !== null &&
      existing.artifactCleanupAfter.getTime() <= now.getTime();
    const staleClaim =
      existing.artifactCleanupStatus === 'claimed' &&
      existing.artifactCleanupClaimedAt !== null &&
      existing.artifactCleanupClaimedAt.getTime() <=
        now.getTime() - ARTIFACT_CLEANUP_CLAIM_TTL_MS;
    if (!pendingDue && !staleClaim) {
      throw workflowError('TEXT_VIDEO_WORKFLOW_INVALID_TRANSITION');
    }
    return this.transitionLoaded(existing, {
      expectedVersion,
      expectedStates: [existing.state],
      mutation: {
        state: existing.state,
        artifactCleanupStatus: 'claimed',
        artifactCleanupClaimedAt: now,
      },
    });
  }

  async completeArtifactCleanup(
    taskId: string,
    expectedVersion: number,
  ): Promise<MediaTextVideoWorkflowEntity> {
    const existing = await this.requireWorkflow(taskId);
    if (existing.artifactCleanupStatus === 'completed') {
      return existing;
    }
    if (existing.artifactCleanupStatus !== 'claimed') {
      throw workflowError('TEXT_VIDEO_WORKFLOW_INVALID_TRANSITION');
    }
    return this.transitionLoaded(existing, {
      expectedVersion,
      expectedStates: [existing.state],
      mutation: {
        state: existing.state,
        artifactCleanupStatus: 'completed',
        artifactCleanupCompletedAt: this.safeNow(),
      },
      idempotent: (workflow) => workflow.artifactCleanupStatus === 'completed',
    });
  }

  async releaseArtifactCleanup(params: {
    taskId: string;
    expectedVersion: number;
    retryAfter: Date;
  }): Promise<MediaTextVideoWorkflowEntity> {
    if (
      !(params.retryAfter instanceof Date) ||
      !Number.isFinite(params.retryAfter.getTime())
    ) {
      throw workflowError('TEXT_VIDEO_WORKFLOW_INVALID_INPUT');
    }
    const existing = await this.requireWorkflow(params.taskId);
    if (existing.artifactCleanupStatus !== 'claimed') {
      throw workflowError('TEXT_VIDEO_WORKFLOW_INVALID_TRANSITION');
    }
    return this.transitionLoaded(existing, {
      expectedVersion: params.expectedVersion,
      expectedStates: [existing.state],
      mutation: {
        state: existing.state,
        artifactCleanupStatus: 'pending',
        artifactCleanupAfter: new Date(params.retryAfter.getTime()),
        artifactCleanupClaimedAt: null,
      },
    });
  }

  async getResumeDirective(
    taskId: string,
  ): Promise<TextVideoWorkflowResumeDirective> {
    const workflow = await this.requireWorkflow(taskId);
    let action: TextVideoWorkflowResumeAction;
    switch (workflow.state) {
      case 'QUEUED':
        action = 'START_COMPILATION';
        break;
      case 'COMPILING':
        action = 'RESUME_COMPILATION';
        break;
      case 'PLANNED':
        action = 'PREPARE_STILL_SUBMISSION';
        break;
      case 'STILL_SUBMITTING':
        action =
          workflow.stillPostDispatchClaimedAt === null
            ? 'CLAIM_STILL_SUBMISSION'
            : 'FAIL_STILL_SUBMISSION_UNCERTAIN';
        break;
      case 'STILL_SUBMISSION_UNCERTAIN':
        action = 'FAIL_STILL_SUBMISSION_UNCERTAIN';
        break;
      case 'STILL_RUNNING':
        action = 'POLL_STILL';
        break;
      case 'STILL_READY':
        action = 'MATERIALIZE_STILL';
        break;
      case 'STILL_CANONICALIZED':
      case 'STILL_QC':
        action = 'RUN_STILL_QC';
        break;
      case 'STILL_ACCEPTED':
        action = 'PREPARE_I2V_SUBMISSION';
        break;
      case 'I2V_SUBMITTING':
        action =
          workflow.i2vDispatchClaimedAt === null
            ? 'CLAIM_I2V_SUBMISSION'
            : 'FAIL_I2V_SUBMISSION_UNCERTAIN';
        break;
      case 'I2V_RUNNING':
        action = 'POLL_I2V';
        break;
      case 'VIDEO_READY':
      case 'VIDEO_QC':
        action = 'RUN_VIDEO_QC';
        break;
      case 'VIDEO_ACCEPTED':
      case 'FINALIZING':
        action = 'FINALIZE_POST';
        break;
      case 'FAILED':
        action = workflow.refundStatus === 'required' ? 'REFUND' : 'DONE';
        break;
      case 'COMPLETED':
        action = 'DONE';
        break;
    }
    return {
      action,
      workflow,
      ...(action === 'FINALIZE_POST'
        ? { idempotencyKey: workflow.taskId }
        : action === 'REFUND'
          ? { idempotencyKey: workflow.chargeId }
          : {}),
    };
  }

  private async transition(params: {
    taskId: string;
    expectedVersion: number;
    expectedStates: readonly TextVideoWorkflowState[];
    mutation: Readonly<TextVideoWorkflowMutation>;
    idempotent?: (workflow: MediaTextVideoWorkflowEntity) => boolean;
  }): Promise<MediaTextVideoWorkflowEntity> {
    return this.transitionLoaded(await this.requireWorkflow(params.taskId), {
      expectedVersion: params.expectedVersion,
      expectedStates: params.expectedStates,
      mutation: params.mutation,
      idempotent: params.idempotent,
    });
  }

  private async transitionLoaded(
    existing: MediaTextVideoWorkflowEntity,
    params: {
      expectedVersion: number;
      expectedStates: readonly TextVideoWorkflowState[];
      mutation: Readonly<TextVideoWorkflowMutation>;
      idempotent?: (workflow: MediaTextVideoWorkflowEntity) => boolean;
    },
  ): Promise<MediaTextVideoWorkflowEntity> {
    if (params.idempotent?.(existing)) {
      return existing;
    }
    assertVersion(existing, params.expectedVersion);
    if (!params.expectedStates.includes(existing.state)) {
      throw workflowError('TEXT_VIDEO_WORKFLOW_INVALID_TRANSITION');
    }
    const result = await this.repository.compareAndSwap({
      taskId: existing.taskId,
      expectedVersion: params.expectedVersion,
      expectedStates: params.expectedStates,
      mutation: params.mutation,
    });
    if (result.outcome === 'applied') {
      return result.workflow;
    }
    if (result.outcome === 'conflict' && params.idempotent?.(result.workflow)) {
      return result.workflow;
    }
    throwCasError(result);
  }

  private async requireWorkflow(
    taskId: string,
  ): Promise<MediaTextVideoWorkflowEntity> {
    assertSafeId(taskId);
    const workflow = await this.repository.findByTaskId(taskId);
    if (!workflow) {
      throw workflowError('TEXT_VIDEO_WORKFLOW_NOT_FOUND');
    }
    return workflow;
  }

  private safeNow(): Date {
    const value = this.now();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw workflowError('TEXT_VIDEO_WORKFLOW_INVALID_INPUT');
    }
    return new Date(value.getTime());
  }
}

function validateSnapshot(snapshot: Readonly<TextVideoWorkflowSnapshot>): void {
  if (!hasExactKeys(snapshot, SNAPSHOT_KEYS)) {
    throw workflowError('TEXT_VIDEO_WORKFLOW_INVALID_INPUT');
  }
  assertSafeId(snapshot?.taskId);
  assertPositiveInteger(snapshot?.userId);
  assertSafeId(snapshot?.chargeId);
  if (
    snapshot.contestSubmissionId !== null &&
    (!Number.isSafeInteger(snapshot.contestSubmissionId) ||
      snapshot.contestSubmissionId <= 0)
  ) {
    throw workflowError('TEXT_VIDEO_WORKFLOW_INVALID_INPUT');
  }
  if (
    snapshot.pipelineMode !== 'cascade' ||
    snapshot.stillProvider !== 'pruna_p_image' ||
    snapshot.stillModel !== 'p-image' ||
    !SAFE_VERSION_PATTERN.test(snapshot.pipelineConfigVersion) ||
    !SAFE_VERSION_PATTERN.test(snapshot.promptCompilerVersion) ||
    !SAFE_VERSION_PATTERN.test(snapshot.stillQcPolicyVersion) ||
    !SAFE_VERSION_PATTERN.test(snapshot.videoQcPolicyVersion) ||
    !SAFE_ENDPOINT_ID_PATTERN.test(snapshot.cascadeRunpodEndpointId) ||
    snapshot.cascadeRunpodApiKeyConfigKey !==
      LTX_TEXT_CASCADE_RUNPOD_API_KEY_CONFIG_KEY ||
    !isPositiveDuration(snapshot.artifactTtlMs) ||
    !isPositiveDuration(snapshot.stillPollIntervalMs) ||
    !isPositiveDuration(snapshot.stillTotalTimeoutMs) ||
    snapshot.stillPollIntervalMs > snapshot.stillTotalTimeoutMs ||
    !isPositiveDuration(snapshot.i2vPollIntervalMs) ||
    !isPositiveDuration(snapshot.i2vTotalTimeoutMs) ||
    snapshot.i2vPollIntervalMs > snapshot.i2vTotalTimeoutMs ||
    !(
      (snapshot.width === 1280 && snapshot.height === 704) ||
      (snapshot.width === 704 && snapshot.height === 1280)
    ) ||
    (snapshot.frames !== 121 && snapshot.frames !== 241) ||
    snapshot.fps !== 24
  ) {
    throw workflowError('TEXT_VIDEO_WORKFLOW_INVALID_INPUT');
  }
  assertSha256(snapshot.rawPromptSha256);
  assertSha256(snapshot.stillPromptSha256);
  assertSha256(snapshot.motionPromptSha256);
  assertSha256(snapshot.prunaClientPolicySha256);
  assertSeed(snapshot.stillSeed);
  assertSeed(snapshot.videoSeed);
}

function snapshotMatches(
  workflow: MediaTextVideoWorkflowEntity,
  snapshot: Readonly<TextVideoWorkflowSnapshot>,
): boolean {
  return (
    workflow.taskId === snapshot.taskId &&
    workflow.userId === snapshot.userId &&
    workflow.chargeId === snapshot.chargeId &&
    workflow.contestSubmissionId === snapshot.contestSubmissionId &&
    workflow.pipelineMode === snapshot.pipelineMode &&
    workflow.pipelineConfigVersion === snapshot.pipelineConfigVersion &&
    workflow.prunaClientPolicySha256 === snapshot.prunaClientPolicySha256 &&
    workflow.promptCompilerVersion === snapshot.promptCompilerVersion &&
    workflow.stillQcPolicyVersion === snapshot.stillQcPolicyVersion &&
    workflow.videoQcPolicyVersion === snapshot.videoQcPolicyVersion &&
    workflow.cascadeRunpodEndpointId === snapshot.cascadeRunpodEndpointId &&
    workflow.cascadeRunpodApiKeyConfigKey ===
      snapshot.cascadeRunpodApiKeyConfigKey &&
    workflow.artifactTtlMs === snapshot.artifactTtlMs &&
    workflow.stillPollIntervalMs === snapshot.stillPollIntervalMs &&
    workflow.stillTotalTimeoutMs === snapshot.stillTotalTimeoutMs &&
    workflow.i2vPollIntervalMs === snapshot.i2vPollIntervalMs &&
    workflow.i2vTotalTimeoutMs === snapshot.i2vTotalTimeoutMs &&
    workflow.rawPromptSha256 === snapshot.rawPromptSha256 &&
    workflow.stillPromptSha256 === snapshot.stillPromptSha256 &&
    workflow.motionPromptSha256 === snapshot.motionPromptSha256 &&
    workflow.width === snapshot.width &&
    workflow.height === snapshot.height &&
    workflow.frames === snapshot.frames &&
    workflow.fps === snapshot.fps &&
    workflow.stillSeed === snapshot.stillSeed &&
    workflow.videoSeed === snapshot.videoSeed &&
    workflow.stillProvider === snapshot.stillProvider &&
    workflow.stillModel === snapshot.stillModel
  );
}

function validateCanonicalArtifact(
  artifact: Readonly<CanonicalStillAdoption>,
): void {
  if (
    !artifact ||
    !hasExactKeys(artifact, CANONICAL_ARTIFACT_KEYS) ||
    artifact.sourceMime !== 'image/jpeg' ||
    artifact.canonicalMime !== 'image/png' ||
    !Number.isSafeInteger(artifact.sourceByteLength) ||
    artifact.sourceByteLength <= 0 ||
    artifact.sourceByteLength > MAX_ARTIFACT_BYTES ||
    !Number.isSafeInteger(artifact.canonicalByteLength) ||
    artifact.canonicalByteLength <= 0 ||
    artifact.canonicalByteLength > MAX_ARTIFACT_BYTES ||
    !PRIVATE_ARTIFACT_REF_PATTERN.test(artifact.privateArtifactRef) ||
    artifact.privateArtifactRef.includes('://') ||
    !(artifact.artifactDeleteAfter instanceof Date) ||
    !Number.isFinite(artifact.artifactDeleteAfter.getTime())
  ) {
    throw workflowError('TEXT_VIDEO_WORKFLOW_INVALID_INPUT');
  }
  assertSha256(artifact.sourceSha256);
  assertSha256(artifact.canonicalSha256);
  assertSha256(artifact.decodedRgbSha256);
  assertDuration(artifact.stillDownloadDurationMs);
  assertDuration(artifact.stillCanonicalizeDurationMs);
}

function assertArtifactMatches(
  workflow: MediaTextVideoWorkflowEntity,
  artifact: Readonly<CanonicalStillAdoption>,
): void {
  assertSame(
    workflow.sourceMime === artifact.sourceMime &&
      workflow.sourceByteLength === artifact.sourceByteLength &&
      workflow.sourceSha256 === artifact.sourceSha256 &&
      workflow.canonicalMime === artifact.canonicalMime &&
      workflow.canonicalByteLength === artifact.canonicalByteLength &&
      workflow.canonicalSha256 === artifact.canonicalSha256 &&
      workflow.decodedRgbSha256 === artifact.decodedRgbSha256 &&
      workflow.privateArtifactRef === artifact.privateArtifactRef &&
      workflow.artifactDeleteAfter?.getTime() ===
        artifact.artifactDeleteAfter.getTime(),
  );
}

function assertPrivateVideoArtifact(params: {
  videoPrivateArtifactRef: string;
  videoArtifactByteLength: number;
  videoWidth: number | null;
  videoHeight: number | null;
  videoHasAudio: boolean | null;
  videoArtifactDeleteAfter: Date;
}): void {
  if (
    !PRIVATE_VIDEO_ARTIFACT_REF_PATTERN.test(params.videoPrivateArtifactRef) ||
    !Number.isSafeInteger(params.videoArtifactByteLength) ||
    params.videoArtifactByteLength <= 0 ||
    params.videoArtifactByteLength > MAX_VIDEO_ARTIFACT_BYTES ||
    !isNullablePositiveInteger(params.videoWidth) ||
    !isNullablePositiveInteger(params.videoHeight) ||
    (params.videoHasAudio !== null &&
      typeof params.videoHasAudio !== 'boolean') ||
    !(params.videoArtifactDeleteAfter instanceof Date) ||
    !Number.isFinite(params.videoArtifactDeleteAfter.getTime())
  ) {
    throw workflowError('TEXT_VIDEO_WORKFLOW_INVALID_INPUT');
  }
}

function assertVideoArtifactMatches(
  workflow: MediaTextVideoWorkflowEntity,
  params: {
    videoArtifactSha256: string;
    videoPrivateArtifactRef: string;
    videoArtifactByteLength: number;
    videoWidth: number | null;
    videoHeight: number | null;
    videoHasAudio: boolean | null;
    videoArtifactDeleteAfter: Date;
  },
): void {
  assertSame(
    workflow.videoArtifactSha256 === params.videoArtifactSha256 &&
      workflow.videoPrivateArtifactRef === params.videoPrivateArtifactRef &&
      workflow.videoArtifactByteLength === params.videoArtifactByteLength &&
      workflow.videoWidth === params.videoWidth &&
      workflow.videoHeight === params.videoHeight &&
      workflow.videoHasAudio === params.videoHasAudio &&
      workflow.videoArtifactDeleteAfter?.getTime() ===
        params.videoArtifactDeleteAfter.getTime(),
  );
}

function isNullablePositiveInteger(value: unknown): value is number | null {
  return value === null || (Number.isSafeInteger(value) && Number(value) > 0);
}

function earliestDate(left: Date | null, right: Date): Date {
  if (!left) {
    return new Date(right.getTime());
  }
  return new Date(Math.min(left.getTime(), right.getTime()));
}

function validateQc(
  decision: TextVideoWorkflowQcDecision,
  reasonCode: string | null,
): void {
  if (
    !['pass', 'reject', 'error'].includes(decision) ||
    (decision === 'pass' && reasonCode !== null) ||
    (decision !== 'pass' &&
      (typeof reasonCode !== 'string' || !SAFE_REASON_PATTERN.test(reasonCode)))
  ) {
    throw workflowError('TEXT_VIDEO_WORKFLOW_INVALID_INPUT');
  }
}

function assertCascade(workflow: MediaTextVideoWorkflowEntity): void {
  if (
    workflow.pipelineMode !== 'cascade' ||
    workflow.stillProvider !== 'pruna_p_image' ||
    workflow.stillModel !== 'p-image'
  ) {
    throw workflowError('TEXT_VIDEO_WORKFLOW_INVALID_TRANSITION');
  }
}

function assertVersion(
  workflow: MediaTextVideoWorkflowEntity,
  expectedVersion: number,
): void {
  if (
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 0 ||
    workflow.version !== expectedVersion
  ) {
    throw workflowError('TEXT_VIDEO_WORKFLOW_VERSION_CONFLICT');
  }
}

function assertSafeId(value: string): void {
  if (typeof value !== 'string' || !SAFE_ID_PATTERN.test(value)) {
    throw workflowError('TEXT_VIDEO_WORKFLOW_INVALID_INPUT');
  }
}

function assertProviderId(value: string): void {
  assertSafeId(value);
}

function assertUuid(value: string): void {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw workflowError('TEXT_VIDEO_WORKFLOW_INVALID_INPUT');
  }
}

function assertSha256(value: string): void {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    throw workflowError('TEXT_VIDEO_WORKFLOW_INVALID_INPUT');
  }
}

function assertReason(value: string): void {
  if (typeof value !== 'string' || !SAFE_REASON_PATTERN.test(value)) {
    throw workflowError('TEXT_VIDEO_WORKFLOW_INVALID_INPUT');
  }
}

function assertSeed(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 4_294_967_295) {
    throw workflowError('TEXT_VIDEO_WORKFLOW_INVALID_INPUT');
  }
}

function assertDuration(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_DURATION_MS) {
    throw workflowError('TEXT_VIDEO_WORKFLOW_INVALID_INPUT');
  }
}

function isPositiveDuration(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_DURATION_MS;
}

function assertPositiveInteger(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw workflowError('TEXT_VIDEO_WORKFLOW_INVALID_INPUT');
  }
}

function assertSame(condition: boolean): void {
  if (!condition) {
    throw workflowError('TEXT_VIDEO_WORKFLOW_INVARIANT_MISMATCH');
  }
}

function hasExactKeys(value: unknown, expected: readonly string[]): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const actual = Object.keys(value).sort();
  const exact = [...expected].sort();
  return (
    actual.length === exact.length &&
    actual.every((key, index) => key === exact[index])
  );
}

function throwCasError(result: TextVideoWorkflowCasResult): never {
  throw workflowError(
    result.outcome === 'not_found'
      ? 'TEXT_VIDEO_WORKFLOW_NOT_FOUND'
      : 'TEXT_VIDEO_WORKFLOW_VERSION_CONFLICT',
  );
}

function workflowError(
  reasonCode: TextVideoWorkflowErrorCode,
): TextVideoWorkflowError {
  return new TextVideoWorkflowError(reasonCode);
}
