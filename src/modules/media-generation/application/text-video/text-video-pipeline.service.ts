import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { ContestFlowService } from 'src/modules/contests/contest-flow.service';
import { MediaGenerationBalanceService } from 'src/modules/media-generation/application/balance/media-generation-balance.service';
import { MediaGenerationFinalizeService } from 'src/modules/media-generation/application/finalize/media-generation-finalize.service';
import { MediaTextVideoJobData } from 'src/modules/media-generation/domain/contracts/media-text-video-job-data.contract';
import { TextVideoWorkflowSnapshot } from 'src/modules/media-generation/domain/contracts/text-video-workflow.contract';
import {
  DEFAULT_LTX_TEXT_PIPELINE_MODE,
  parseLtxTextPipelineMode,
} from 'src/modules/media-generation/domain/contracts/ltx-text-pipeline-mode.contract';
import { MediaTextVideoWorkflowEntity } from 'src/modules/media-generation/persistence/entities/media-text-video-workflow.entity';
import {
  asPrivateStillArtifactRef,
  PrunaStillArtifactStore,
} from 'src/modules/media-generation/infrastructure/providers/pruna/pruna-still-artifact.store';
import {
  CanonicalPrunaStillArtifact,
  PrunaStillMaterializationRequest,
} from 'src/modules/media-generation/infrastructure/providers/pruna/pruna-p-image-still.provider';
import { PrunaPImageClientError } from 'src/modules/media-generation/infrastructure/providers/pruna/pruna-p-image.types';
import {
  CascadeLtxI2VPayload,
  CascadeLtxI2VPayloadBuilder,
  CascadeLtxI2VPayloadError,
} from 'src/modules/media-generation/infrastructure/providers/runpod/cascade-ltx-i2v-payload.builder';
import { CascadeLtxI2vProviderError } from 'src/modules/media-generation/infrastructure/providers/runpod/cascade-ltx-i2v.provider';
import { TextVideoWorkflowPersistenceError } from './text-video-workflow.repository';
import {
  TextVideoWorkflowError,
  TextVideoWorkflowService,
} from './text-video-workflow.service';
import { TextVideoCascadeRuntimeConfigService } from './text-video-cascade-runtime-config.service';
import {
  CascadeLtxI2vRoute,
  CompiledTextVideoPrompts,
  MaterializedCascadeVideo,
  StagedCascadeVideo,
  TEXT_VIDEO_I2V_PROVIDER,
  TEXT_VIDEO_PRIVATE_ARTIFACT_STORE,
  TEXT_VIDEO_STILL_PROVIDER,
  TEXT_VIDEO_STILL_QC,
  TEXT_VIDEO_VIDEO_QC,
  TEXT_VIDEO_WORKFLOW_STATE_MACHINE,
  TextVideoI2vProviderPort,
  TextVideoPromptCompilerPort,
  TextVideoStillProviderPort,
  TextVideoStillQcPort,
  TextVideoVideoQcPort,
} from './text-video-pipeline.ports';
import { VerbatimTextVideoPromptCompiler } from './text-video-prompt-compiler';

const SHA256 = /^[a-f0-9]{64}$/;
const MAX_TRANSITIONS_PER_RUN = 64;

export type TextVideoPipelineResult = Awaited<
  ReturnType<
    MediaGenerationFinalizeService['finalizeAcceptedTextVideoGeneration']
  >
>;

export class TextVideoPipelineError extends Error {
  constructor(
    readonly reasonCode: string,
    readonly retryable = false,
  ) {
    super(reasonCode);
    this.name = 'TextVideoPipelineError';
  }

  toJSON(): { reasonCode: string; retryable: boolean } {
    return { reasonCode: this.reasonCode, retryable: this.retryable };
  }
}

@Injectable()
export class TextVideoPipelineClock {
  now(): Date {
    return new Date();
  }

  sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}

/** Consecutive COMPLETED-but-unreadable polls tolerated before failing. */
const MAX_OUTPUT_MISSING_POLLS = 5;

/**
 * Stateful runner for one immutable queue snapshot. It performs no routing and
 * never falls back: native calls the existing finalizer, cascade calls only its
 * fixed Pruna -> private checkpoint -> LTX I2V chain.
 */
@Injectable()
export class TextVideoPipelineService {
  constructor(
    private readonly runtimeConfig: TextVideoCascadeRuntimeConfigService,
    private readonly compiler: VerbatimTextVideoPromptCompiler,
    private readonly payloadBuilder: CascadeLtxI2VPayloadBuilder,
    @Inject(TEXT_VIDEO_WORKFLOW_STATE_MACHINE)
    private readonly workflows: TextVideoWorkflowService,
    @Inject(TEXT_VIDEO_STILL_PROVIDER)
    private readonly stillProvider: TextVideoStillProviderPort,
    @Inject(TEXT_VIDEO_STILL_QC)
    private readonly stillQc: TextVideoStillQcPort,
    @Inject(TEXT_VIDEO_VIDEO_QC)
    private readonly videoQc: TextVideoVideoQcPort,
    @Inject(TEXT_VIDEO_I2V_PROVIDER)
    private readonly i2vProvider: TextVideoI2vProviderPort,
    @Inject(TEXT_VIDEO_PRIVATE_ARTIFACT_STORE)
    private readonly privateArtifactStore: PrunaStillArtifactStore,
    private readonly finalizer: MediaGenerationFinalizeService,
    private readonly balance: MediaGenerationBalanceService,
    private readonly contestFlow: ContestFlowService,
    private readonly clock: TextVideoPipelineClock,
  ) {}

  async runOrResume(
    taskId: string,
    jobData?: MediaTextVideoJobData,
  ): Promise<TextVideoPipelineResult> {
    if (!jobData) {
      throw new TextVideoPipelineError('LTX_TEXT_JOB_CONTEXT_REQUIRED');
    }
    const mode = parseLtxTextPipelineMode(
      jobData.ltxTextPipelineMode === undefined
        ? DEFAULT_LTX_TEXT_PIPELINE_MODE
        : jobData.ltxTextPipelineMode,
    );
    if (mode === 'native') {
      return this.finalizer.finalizeTextVideoGeneration(
        jobData.request,
        jobData.userId,
      );
    }

    let workflow: MediaTextVideoWorkflowEntity | null = null;
    try {
      assertCascadeJob(taskId, jobData);
      workflow = await this.loadWorkflowIfExists(taskId);
      const resumingExistingWorkflow = workflow !== null;
      const runtime = await this.runtimeConfig.getRuntimeSnapshot();
      const prompts = workflow
        ? resumePrompts(workflow, jobData.request.prompt)
        : this.compiler.compile(jobData.request.prompt);
      if (workflow) {
        assertWorkflowResumeInput(workflow, jobData, prompts);
        if (workflow.state === 'COMPLETED') {
          return this.finalizer.loadFinalizedTextVideoGeneration(
            workflow.finalPostId!,
            jobData.request.contestId,
          );
        }
        if (workflow.state === 'FAILED') {
          return this.failTerminal(
            workflow,
            jobData,
            workflow.terminalReasonCode ?? 'LTX_CASCADE_FAILED',
          );
        }
      } else {
        const snapshot = buildWorkflowSnapshot(
          taskId,
          jobData,
          runtime,
          prompts,
        );
        workflow = await this.workflows.createOrLoad(snapshot);
      }
      workflow = await this.finishPlanning(workflow);
      this.assertReady(runtime, prompts, resumingExistingWorkflow);
      const executionRuntime = runtimeWithWorkflowSnapshot(runtime, workflow);

      let stagedVideo: StagedCascadeVideo | null = null;
      for (
        let transition = 0;
        transition < MAX_TRANSITIONS_PER_RUN;
        transition += 1
      ) {
        switch (workflow.state) {
          case 'QUEUED':
          case 'COMPILING':
            workflow = await this.finishPlanning(workflow);
            break;
          case 'PLANNED':
            workflow = await this.workflows.prepareStillSubmission({
              taskId,
              expectedVersion: workflow.version,
              submissionAttemptId: randomUUID(),
              stillRequestSha256: buildStillRequestHash(
                prompts.stillPrompt,
                workflow,
              ),
            });
            break;
          case 'STILL_SUBMITTING':
            workflow = await this.runStillSubmission(
              workflow,
              prompts.stillPrompt,
            );
            break;
          case 'STILL_SUBMISSION_UNCERTAIN':
            return this.failTerminal(
              workflow,
              jobData,
              'PRUNA_SUBMISSION_UNCERTAIN',
            );
          case 'STILL_RUNNING':
            workflow = await this.waitForStill(workflow, executionRuntime);
            break;
          case 'STILL_READY':
            workflow = await this.materializeStill(workflow, executionRuntime);
            break;
          case 'STILL_CANONICALIZED':
            workflow = await this.workflows.beginStillQc(
              taskId,
              workflow.version,
            );
            break;
          case 'STILL_QC':
            workflow = await this.runStillQc(workflow);
            break;
          case 'STILL_ACCEPTED':
            workflow = await this.prepareI2v(workflow, prompts.motionPrompt);
            break;
          case 'I2V_SUBMITTING': {
            const result = await this.runI2vSubmission(
              workflow,
              prompts.motionPrompt,
            );
            workflow = result;
            break;
          }
          case 'I2V_RUNNING': {
            const result = await this.waitForI2v(workflow, executionRuntime);
            workflow = result.workflow;
            stagedVideo = result.video;
            break;
          }
          case 'VIDEO_READY':
            workflow = await this.workflows.beginVideoQc(
              taskId,
              workflow.version,
            );
            break;
          case 'VIDEO_QC':
            stagedVideo = stagedVideo ?? stagedVideoFromWorkflow(workflow);
            workflow = await this.runVideoQc(workflow, stagedVideo);
            break;
          case 'VIDEO_ACCEPTED': {
            stagedVideo = stagedVideo ?? stagedVideoFromWorkflow(workflow);
            const published = await this.publishAcceptedVideo(
              workflow,
              stagedVideo,
            );
            return await this.finalizeOnce(workflow, jobData, published);
          }
          case 'FINALIZING': {
            return await this.finalizeOnce(workflow, jobData, null);
          }
          case 'COMPLETED':
            return this.finalizer.loadFinalizedTextVideoGeneration(
              workflow.finalPostId!,
              jobData.request.contestId,
            );
          case 'FAILED':
            return this.failTerminal(
              workflow,
              jobData,
              workflow.terminalReasonCode ?? 'LTX_CASCADE_FAILED',
            );
        }
      }
      throw new TextVideoPipelineError('LTX_CASCADE_TRANSITION_LIMIT', true);
    } catch (error) {
      const mapped =
        error instanceof TextVideoPipelineError
          ? error
          : mapPipelineError(error);
      if (mapped.retryable) {
        throw mapped;
      }
      workflow = await this.workflows.getByTaskId(taskId).catch(() => workflow);
      if (
        workflow?.state === 'FAILED' &&
        workflow.refundStatus === 'completed'
      ) {
        throw new TextVideoPipelineError(
          workflow.terminalReasonCode ?? mapped.reasonCode,
        );
      }
      if (
        workflow &&
        workflow.state !== 'COMPLETED' &&
        workflow.state !== 'FINALIZING'
      ) {
        return this.failTerminal(workflow, jobData, mapped.reasonCode);
      }
      throw mapped;
    }
  }

  private assertReady(
    runtime: Awaited<
      ReturnType<TextVideoCascadeRuntimeConfigService['getRuntimeSnapshot']>
    >,
    prompts: CompiledTextVideoPrompts,
    resumingExistingWorkflow: boolean,
  ): void {
    const runtimeRouteReady = resumingExistingWorkflow
      ? true
      : runtime.enabled &&
        runtime.prunaEnabled &&
        runtime.prunaModel === 'p-image' &&
        runtime.stillQcEnabled &&
        runtime.videoQcEnabled &&
        runtime.cascadeRunpodReady &&
        prompts.compilerVersion === runtime.promptCompilerVersion;
    const ready =
      runtimeRouteReady &&
      (resumingExistingWorkflow || this.compiler.isConfigured()) &&
      this.stillQc.isConfigured() &&
      this.videoQc.isConfigured() &&
      this.privateArtifactStore.isConfigured?.() === true;
    if (!ready) {
      throw new TextVideoPipelineError('LTX_CASCADE_NOT_CONFIGURED');
    }
  }

  private async loadWorkflowIfExists(
    taskId: string,
  ): Promise<MediaTextVideoWorkflowEntity | null> {
    try {
      return await this.workflows.getByTaskId(taskId);
    } catch (error) {
      if (
        error instanceof TextVideoWorkflowError &&
        error.reasonCode === 'TEXT_VIDEO_WORKFLOW_NOT_FOUND'
      ) {
        return null;
      }
      throw error;
    }
  }

  private async finishPlanning(
    workflow: MediaTextVideoWorkflowEntity,
  ): Promise<MediaTextVideoWorkflowEntity> {
    if (workflow.state === 'QUEUED') {
      workflow = await this.workflows.advancePlanning(
        workflow.taskId,
        workflow.version,
        'COMPILING',
      );
    }
    if (workflow.state === 'COMPILING') {
      workflow = await this.workflows.advancePlanning(
        workflow.taskId,
        workflow.version,
        'PLANNED',
      );
    }
    return workflow;
  }

  private async runStillSubmission(
    workflow: MediaTextVideoWorkflowEntity,
    stillPrompt: string,
  ): Promise<MediaTextVideoWorkflowEntity> {
    if (workflow.stillPostDispatchClaimedAt !== null) {
      workflow = await this.workflows.recordStillSubmissionUncertain({
        taskId: workflow.taskId,
        expectedVersion: workflow.version,
        submissionAttemptId: workflow.submissionAttemptId!,
      });
      return workflow;
    }
    const claim = await this.workflows.claimStillSubmissionDispatch({
      taskId: workflow.taskId,
      expectedVersion: workflow.version,
      submissionAttemptId: workflow.submissionAttemptId!,
    });
    if (claim.disposition !== 'submit_once') {
      return claim.workflow;
    }

    const startedAt = this.clock.now().getTime();
    const submission = await this.stillProvider.submit(
      {
        prompt: stillPrompt,
        width: workflow.width,
        height: workflow.height,
        seed: workflow.stillSeed,
      },
      workflow.prunaClientPolicySha256,
    );
    if (submission.certainty === 'accepted') {
      if (submission.requestHash !== workflow.stillRequestSha256) {
        throw new TextVideoPipelineError('PRUNA_REQUEST_HASH_MISMATCH');
      }
      return this.workflows.recordStillSubmissionAccepted({
        taskId: workflow.taskId,
        expectedVersion: claim.workflow.version,
        submissionAttemptId: workflow.submissionAttemptId!,
        predictionId: submission.predictionId,
        stillSubmitDurationMs: elapsedMs(startedAt, this.clock.now()),
      });
    }
    if (submission.certainty === 'unknown') {
      return this.workflows.recordStillSubmissionUncertain({
        taskId: workflow.taskId,
        expectedVersion: claim.workflow.version,
        submissionAttemptId: workflow.submissionAttemptId!,
      });
    }
    throw new TextVideoPipelineError(submission.reasonCode);
  }

  private async waitForStill(
    workflow: MediaTextVideoWorkflowEntity,
    runtime: Awaited<
      ReturnType<TextVideoCascadeRuntimeConfigService['getRuntimeSnapshot']>
    >,
  ): Promise<MediaTextVideoWorkflowEntity> {
    const startedAt = this.clock.now().getTime();
    while (true) {
      const status = await this.stillProvider.getStatus(
        workflow.providerPredictionId!,
        workflow.prunaClientPolicySha256,
      );
      if (status.status === 'succeeded') {
        return this.workflows.markStillReady({
          taskId: workflow.taskId,
          expectedVersion: workflow.version,
          stillPollDurationMs: elapsedMs(startedAt, this.clock.now()),
        });
      }
      if (status.status === 'failed' || status.status === 'canceled') {
        throw new TextVideoPipelineError(
          status.status === 'failed'
            ? 'PRUNA_PREDICTION_FAILED'
            : 'PRUNA_PREDICTION_CANCELED',
        );
      }
      if (
        this.clock.now().getTime() - startedAt >=
        runtime.stillTotalTimeoutMs
      ) {
        throw new TextVideoPipelineError('PRUNA_STATUS_TIMEOUT');
      }
      await this.clock.sleep(runtime.stillPollIntervalMs);
    }
  }

  private async materializeStill(
    workflow: MediaTextVideoWorkflowEntity,
    runtime: Awaited<
      ReturnType<TextVideoCascadeRuntimeConfigService['getRuntimeSnapshot']>
    >,
  ): Promise<MediaTextVideoWorkflowEntity> {
    const status = await this.stillProvider.getStatus(
      workflow.providerPredictionId!,
      workflow.prunaClientPolicySha256,
    );
    if (status.status !== 'succeeded') {
      throw new TextVideoPipelineError('PRUNA_STATUS_UNAVAILABLE', true);
    }
    const request: PrunaStillMaterializationRequest = {
      predictionId: workflow.providerPredictionId!,
      width: workflow.width,
      height: workflow.height,
    };
    const artifact = await this.stillProvider.materialize(
      request,
      workflow.prunaClientPolicySha256,
    );
    assertArtifactForWorkflow(artifact, workflow);
    return this.workflows.adoptCanonicalArtifact({
      taskId: workflow.taskId,
      expectedVersion: workflow.version,
      artifact: {
        sourceMime: artifact.sourceMime,
        sourceByteLength: artifact.sourceByteLength,
        sourceSha256: artifact.sourceSha256,
        canonicalMime: artifact.canonicalMime,
        canonicalByteLength: artifact.canonicalByteLength,
        canonicalSha256: artifact.canonicalSha256,
        decodedRgbSha256: artifact.decodedRgbSha256,
        privateArtifactRef: artifact.privateArtifactRef,
        artifactDeleteAfter: new Date(
          this.clock.now().getTime() + runtime.artifactTtlMs,
        ),
        stillDownloadDurationMs: artifact.downloadDurationMs,
        stillCanonicalizeDurationMs: artifact.canonicalizeDurationMs,
      },
    });
  }

  private async runStillQc(
    workflow: MediaTextVideoWorkflowEntity,
  ): Promise<MediaTextVideoWorkflowEntity> {
    const artifact = artifactFromWorkflow(workflow);
    const canonicalPng = await this.stillProvider.loadCanonicalBytes(artifact);
    let result;
    try {
      result = await this.stillQc.evaluate({
        canonicalPng,
        artifact,
        stillPromptSha256: workflow.stillPromptSha256,
        policyVersion: workflow.stillQcPolicyVersion,
      });
    } finally {
      canonicalPng.fill(0);
    }
    return this.workflows.recordStillQc({
      taskId: workflow.taskId,
      expectedVersion: workflow.version,
      decision: result.decision,
      reasonCode: result.reasonCode,
      durationMs: result.durationMs,
    });
  }

  private async prepareI2v(
    workflow: MediaTextVideoWorkflowEntity,
    motionPrompt: string,
  ): Promise<MediaTextVideoWorkflowEntity> {
    const canonicalPng = await this.stillProvider.loadCanonicalBytes(
      artifactFromWorkflow(workflow),
    );
    try {
      const payload = this.payloadBuilder.build({
        prompt: motionPrompt,
        canonicalPng,
        width: workflow.width,
        height: workflow.height,
        frames: workflow.frames,
        seed: workflow.videoSeed,
      });
      return this.workflows.prepareI2vSubmission({
        taskId: workflow.taskId,
        expectedVersion: workflow.version,
        i2vRequestSha256: hashCanonical({ input: payload }),
      });
    } finally {
      canonicalPng.fill(0);
    }
  }

  private async runI2vSubmission(
    workflow: MediaTextVideoWorkflowEntity,
    motionPrompt: string,
  ): Promise<MediaTextVideoWorkflowEntity> {
    if (workflow.i2vDispatchClaimedAt !== null) {
      throw new TextVideoPipelineError('RUNPOD_SUBMISSION_UNCERTAIN');
    }
    const canonicalPng = await this.stillProvider.loadCanonicalBytes(
      artifactFromWorkflow(workflow),
    );
    let payload: CascadeLtxI2VPayload;
    try {
      payload = this.payloadBuilder.build({
        prompt: motionPrompt,
        canonicalPng,
        width: workflow.width,
        height: workflow.height,
        frames: workflow.frames,
        seed: workflow.videoSeed,
      });
    } finally {
      canonicalPng.fill(0);
    }
    if (hashCanonical({ input: payload }) !== workflow.i2vRequestSha256) {
      throw new TextVideoPipelineError('LTX_CASCADE_REQUEST_HASH_MISMATCH');
    }
    const claim = await this.workflows.claimI2vSubmissionDispatch({
      taskId: workflow.taskId,
      expectedVersion: workflow.version,
      i2vRequestSha256: workflow.i2vRequestSha256!,
    });
    if (claim.disposition !== 'submit_once') {
      return claim.workflow;
    }
    const submission = await this.i2vProvider.submit(
      cascadeRouteFromWorkflow(workflow),
      payload,
    );
    if (submission.certainty === 'unknown') {
      throw new TextVideoPipelineError(submission.reasonCode);
    }
    return this.workflows.adoptRunpodJob({
      taskId: workflow.taskId,
      expectedVersion: claim.workflow.version,
      i2vRequestSha256: workflow.i2vRequestSha256!,
      runpodJobId: submission.jobId,
    });
  }

  private async waitForI2v(
    workflow: MediaTextVideoWorkflowEntity,
    runtime: Awaited<
      ReturnType<TextVideoCascadeRuntimeConfigService['getRuntimeSnapshot']>
    >,
  ): Promise<{
    workflow: MediaTextVideoWorkflowEntity;
    video: StagedCascadeVideo;
  }> {
    const startedAt = this.clock.now().getTime();
    // RunPod can report COMPLETED a moment before the job output is readable
    // back, which used to kill the workflow outright. Tolerate a few of those
    // polls before treating the output as genuinely unusable.
    let outputMissingPolls = 0;
    while (true) {
      const status = await this.i2vProvider.getStatus(
        cascadeRouteFromWorkflow(workflow),
        workflow.runpodJobId!,
      );
      if (status.status === 'output_missing') {
        outputMissingPolls += 1;
        if (outputMissingPolls > MAX_OUTPUT_MISSING_POLLS) {
          throw new TextVideoPipelineError('RUNPOD_OUTPUT_INVALID');
        }
      }
      if (status.status === 'completed') {
        const video = await this.i2vProvider.stageForQc(
          cascadeRouteFromWorkflow(workflow),
          workflow.runpodJobId!,
          workflow.taskId,
        );
        const deleteAfter =
          workflow.artifactDeleteAfter ??
          new Date(this.clock.now().getTime() + runtime.artifactTtlMs);
        return {
          workflow: await this.workflows.markVideoReady({
            taskId: workflow.taskId,
            expectedVersion: workflow.version,
            videoArtifactSha256: video.artifactSha256,
            videoPrivateArtifactRef: video.privateArtifactRef,
            videoArtifactByteLength: video.byteLength,
            videoWidth: video.width,
            videoHeight: video.height,
            videoHasAudio: video.hasAudio,
            videoArtifactDeleteAfter: deleteAfter,
            i2vDurationMs: elapsedMs(startedAt, this.clock.now()),
          }),
          video,
        };
      }
      if (status.status === 'failed') {
        throw new TextVideoPipelineError(status.reasonCode);
      }
      if (this.clock.now().getTime() - startedAt >= runtime.i2vTotalTimeoutMs) {
        throw new TextVideoPipelineError('RUNPOD_STATUS_TIMEOUT');
      }
      await this.clock.sleep(runtime.i2vPollIntervalMs);
    }
  }

  private async publishAcceptedVideo(
    workflow: MediaTextVideoWorkflowEntity,
    staged: Readonly<StagedCascadeVideo>,
  ): Promise<MaterializedCascadeVideo> {
    const video = await this.i2vProvider.publishOnce(
      cascadeRouteFromWorkflow(workflow),
      workflow.runpodJobId!,
      staged,
      workflow.taskId,
    );
    if (workflow.videoArtifactSha256 !== video.artifactSha256) {
      throw new TextVideoPipelineError('RUNPOD_VIDEO_HASH_MISMATCH');
    }
    return video;
  }

  private async runVideoQc(
    workflow: MediaTextVideoWorkflowEntity,
    video: StagedCascadeVideo,
  ): Promise<MediaTextVideoWorkflowEntity> {
    const loaded = await this.i2vProvider.loadStagedForQc(video);
    let result;
    try {
      result = await this.videoQc.evaluate({
        runpodJobId: workflow.runpodJobId!,
        videoArtifactSha256: video.artifactSha256,
        artifact: loaded.artifact,
        mp4Bytes: loaded.mp4Bytes,
        motionPromptSha256: workflow.motionPromptSha256,
        policyVersion: workflow.videoQcPolicyVersion,
      });
    } finally {
      loaded.mp4Bytes.fill(0);
    }
    return this.workflows.recordVideoQc({
      taskId: workflow.taskId,
      expectedVersion: workflow.version,
      decision: result.decision,
      reasonCode: result.reasonCode,
      durationMs: result.durationMs,
    });
  }

  private async finalizeOnce(
    workflow: MediaTextVideoWorkflowEntity,
    jobData: MediaTextVideoJobData,
    video: MaterializedCascadeVideo | null,
  ): Promise<TextVideoPipelineResult> {
    const claim = await this.workflows.claimFinalization(
      workflow.taskId,
      workflow.version,
    );
    if (!video) {
      const adopted = await this.finalizer.reconcileAcceptedTextVideoGeneration(
        workflow.taskId,
        jobData.request,
        jobData.userId,
      );
      if (adopted) {
        const adoptedPostId = Number(adopted.data?.[0]?.id);
        const completed = await this.workflows.completeFinalization({
          taskId: workflow.taskId,
          expectedVersion: claim.workflow.version,
          finalPostId: adoptedPostId,
          totalDurationMs: elapsedMs(
            workflow.createdAt.getTime(),
            this.clock.now(),
          ),
        });
        await this.cleanupTerminalArtifacts(completed);
        return adopted;
      }
      video = await this.publishAcceptedVideo(
        claim.workflow,
        stagedVideoFromWorkflow(claim.workflow),
      );
    }
    const result = await this.finalizer.finalizeAcceptedTextVideoGeneration(
      claim.idempotencyKey,
      jobData.request,
      jobData.userId,
      video.result,
    );
    const finalPostId = Number(result.data?.[0]?.id);
    if (!Number.isSafeInteger(finalPostId) || finalPostId <= 0) {
      throw new TextVideoPipelineError('LTX_CASCADE_FINAL_POST_INVALID');
    }
    const completed = await this.workflows.completeFinalization({
      taskId: workflow.taskId,
      expectedVersion: claim.workflow.version,
      finalPostId,
      totalDurationMs: elapsedMs(
        workflow.createdAt.getTime(),
        this.clock.now(),
      ),
    });
    await this.cleanupTerminalArtifacts(completed);
    return result;
  }

  private async failTerminal(
    workflow: MediaTextVideoWorkflowEntity,
    jobData: MediaTextVideoJobData,
    reasonCode: string,
  ): Promise<never> {
    if (workflow.state !== 'FAILED') {
      workflow = await this.workflows.failWorkflow({
        taskId: workflow.taskId,
        expectedVersion: workflow.version,
        reasonCode: safeReason(reasonCode),
      });
    }
    if (workflow.refundStatus === 'required') {
      await this.contestFlow.markSubmissionFailed(
        workflow.contestSubmissionId ?? jobData.request.contestSubmissionId,
      );
      await this.balance.refund(workflow.chargeId);
      workflow = await this.workflows.markRefundCompleted(
        workflow.taskId,
        workflow.version,
      );
    }
    await this.cleanupTerminalArtifacts(workflow);
    throw new TextVideoPipelineError(
      workflow.terminalReasonCode ?? safeReason(reasonCode),
    );
  }

  private async cleanupTerminalArtifacts(
    workflow: MediaTextVideoWorkflowEntity,
  ): Promise<void> {
    if (
      workflow.artifactCleanupStatus !== 'pending' ||
      workflow.artifactCleanupAfter === null ||
      workflow.artifactCleanupAfter.getTime() > this.clock.now().getTime()
    ) {
      return;
    }
    try {
      const claimed = await this.workflows.claimArtifactCleanup(
        workflow.taskId,
        workflow.version,
      );
      if (claimed.privateArtifactRef) {
        await this.privateArtifactStore.deleteCanonicalPng(
          asPrivateStillArtifactRef(claimed.privateArtifactRef),
        );
      }
      if (claimed.videoPrivateArtifactRef && claimed.videoArtifactSha256) {
        await this.i2vProvider.deleteStaged(stagedVideoFromWorkflow(claimed));
      }
      await this.workflows.completeArtifactCleanup(
        claimed.taskId,
        claimed.version,
      );
    } catch {
      const latest = await this.workflows
        .getByTaskId(workflow.taskId)
        .catch(() => null);
      if (latest?.artifactCleanupStatus === 'claimed') {
        await this.workflows
          .releaseArtifactCleanup({
            taskId: latest.taskId,
            expectedVersion: latest.version,
            retryAfter: new Date(this.clock.now().getTime() + 5 * 60_000),
          })
          .catch(() => undefined);
      }
    }
  }
}

function assertCascadeJob(
  taskId: string,
  jobData: MediaTextVideoJobData,
): void {
  if (
    typeof taskId !== 'string' ||
    !/^[A-Za-z0-9_-]{8,64}$/.test(taskId) ||
    !jobData ||
    !Number.isSafeInteger(jobData.userId) ||
    jobData.userId <= 0 ||
    typeof jobData.chargeId !== 'string' ||
    !/^[A-Za-z0-9_-]{8,64}$/.test(jobData.chargeId) ||
    jobData.ltxTextPipelineMode !== 'cascade'
  ) {
    throw new TextVideoPipelineError('LTX_CASCADE_JOB_INVALID');
  }
}

function assertWorkflowResumeInput(
  workflow: MediaTextVideoWorkflowEntity,
  jobData: MediaTextVideoJobData,
  prompts: CompiledTextVideoPrompts,
): void {
  const horizontal = jobData.request.orientation === 'horizontal';
  const videoSeed =
    jobData.request.seed ?? deterministicSeed(`${workflow.taskId}:video`);
  const stillSeed = deterministicSeed(`${workflow.taskId}:${videoSeed}:still`);
  const matches =
    workflow.taskId.length > 0 &&
    workflow.userId === jobData.userId &&
    workflow.chargeId === jobData.chargeId &&
    workflow.contestSubmissionId ===
      (jobData.request.contestSubmissionId ?? null) &&
    workflow.pipelineMode === 'cascade' &&
    workflow.promptCompilerVersion === prompts.compilerVersion &&
    workflow.rawPromptSha256 === sha256(jobData.request.prompt) &&
    workflow.stillPromptSha256 === sha256(prompts.stillPrompt) &&
    workflow.motionPromptSha256 === sha256(prompts.motionPrompt) &&
    workflow.width === (horizontal ? 1280 : 704) &&
    workflow.height === (horizontal ? 704 : 1280) &&
    workflow.frames === (jobData.request.duration >= 8 ? 241 : 121) &&
    workflow.fps === 24 &&
    workflow.stillSeed === stillSeed &&
    workflow.videoSeed === videoSeed &&
    workflow.stillProvider === 'pruna_p_image' &&
    workflow.stillModel === 'p-image';
  if (!matches) {
    throw new TextVideoPipelineError('LTX_CASCADE_SNAPSHOT_CONFLICT');
  }
}

function resumePrompts(
  workflow: MediaTextVideoWorkflowEntity,
  rawPrompt: string,
): CompiledTextVideoPrompts {
  return {
    compilerVersion: workflow.promptCompilerVersion,
    stillPrompt: rawPrompt,
    motionPrompt: rawPrompt,
  };
}

function buildWorkflowSnapshot(
  taskId: string,
  jobData: MediaTextVideoJobData,
  runtime: Awaited<
    ReturnType<TextVideoCascadeRuntimeConfigService['getRuntimeSnapshot']>
  >,
  prompts: CompiledTextVideoPrompts,
): TextVideoWorkflowSnapshot {
  const horizontal = jobData.request.orientation === 'horizontal';
  const videoSeed =
    jobData.request.seed ?? deterministicSeed(`${taskId}:video`);
  const stillSeed = deterministicSeed(`${taskId}:${videoSeed}:still`);
  return {
    taskId,
    userId: jobData.userId,
    chargeId: jobData.chargeId!,
    contestSubmissionId: jobData.request.contestSubmissionId ?? null,
    pipelineMode: 'cascade',
    pipelineConfigVersion: runtime.pipelineConfigVersion,
    prunaClientPolicySha256: runtime.prunaClientPolicySha256,
    promptCompilerVersion: prompts.compilerVersion,
    stillQcPolicyVersion: runtime.stillQcPolicyVersion,
    videoQcPolicyVersion: runtime.videoQcPolicyVersion,
    cascadeRunpodEndpointId: runtime.cascadeRunpodEndpointId,
    cascadeRunpodApiKeyConfigKey: runtime.cascadeRunpodApiKeyConfigKey,
    artifactTtlMs: runtime.artifactTtlMs,
    stillPollIntervalMs: runtime.stillPollIntervalMs,
    stillTotalTimeoutMs: runtime.stillTotalTimeoutMs,
    i2vPollIntervalMs: runtime.i2vPollIntervalMs,
    i2vTotalTimeoutMs: runtime.i2vTotalTimeoutMs,
    rawPromptSha256: sha256(jobData.request.prompt),
    stillPromptSha256: sha256(prompts.stillPrompt),
    motionPromptSha256: sha256(prompts.motionPrompt),
    width: horizontal ? 1280 : 704,
    height: horizontal ? 704 : 1280,
    frames: jobData.request.duration >= 8 ? 241 : 121,
    fps: 24,
    stillSeed,
    videoSeed,
    stillProvider: 'pruna_p_image',
    stillModel: 'p-image',
  };
}

function runtimeWithWorkflowSnapshot(
  runtime: Awaited<
    ReturnType<TextVideoCascadeRuntimeConfigService['getRuntimeSnapshot']>
  >,
  workflow: MediaTextVideoWorkflowEntity,
): Awaited<
  ReturnType<TextVideoCascadeRuntimeConfigService['getRuntimeSnapshot']>
> {
  return {
    ...runtime,
    pipelineConfigVersion: workflow.pipelineConfigVersion,
    prunaClientPolicySha256: workflow.prunaClientPolicySha256,
    promptCompilerVersion: workflow.promptCompilerVersion,
    stillQcPolicyVersion: workflow.stillQcPolicyVersion,
    videoQcPolicyVersion: workflow.videoQcPolicyVersion,
    artifactTtlMs: workflow.artifactTtlMs,
    stillPollIntervalMs: workflow.stillPollIntervalMs,
    stillTotalTimeoutMs: workflow.stillTotalTimeoutMs,
    i2vPollIntervalMs: workflow.i2vPollIntervalMs,
    i2vTotalTimeoutMs: workflow.i2vTotalTimeoutMs,
    cascadeRunpodEndpointId: workflow.cascadeRunpodEndpointId,
    cascadeRunpodApiKeyConfigKey: workflow.cascadeRunpodApiKeyConfigKey,
  };
}

function buildStillRequestHash(
  prompt: string,
  workflow: MediaTextVideoWorkflowEntity,
): string {
  return sha256(
    `p-image\n${canonicalJson({
      input: {
        prompt,
        aspect_ratio: 'custom',
        width: workflow.width,
        height: workflow.height,
        prompt_upsampling: false,
        seed: workflow.stillSeed,
        disable_safety_checker: false,
      },
    })}\n${workflow.pipelineConfigVersion}`,
  );
}

function cascadeRouteFromWorkflow(
  workflow: MediaTextVideoWorkflowEntity,
): CascadeLtxI2vRoute {
  return {
    endpointId: workflow.cascadeRunpodEndpointId,
    apiKeyConfigKey: workflow.cascadeRunpodApiKeyConfigKey,
  };
}

function stagedVideoFromWorkflow(
  workflow: MediaTextVideoWorkflowEntity,
): StagedCascadeVideo {
  if (
    !workflow.videoPrivateArtifactRef ||
    !/^video_stage_[a-f0-9]{64}$/.test(workflow.videoPrivateArtifactRef) ||
    !workflow.videoArtifactSha256 ||
    !SHA256.test(workflow.videoArtifactSha256) ||
    !workflow.videoArtifactByteLength ||
    workflow.videoArtifactByteLength <= 0
  ) {
    throw new TextVideoPipelineError('RUNPOD_VIDEO_ARTIFACT_INVALID');
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

function artifactFromWorkflow(
  workflow: MediaTextVideoWorkflowEntity,
): CanonicalPrunaStillArtifact {
  if (
    workflow.sourceMime !== 'image/jpeg' ||
    workflow.canonicalMime !== 'image/png' ||
    !workflow.sourceByteLength ||
    !workflow.canonicalByteLength ||
    !workflow.sourceSha256 ||
    !workflow.canonicalSha256 ||
    !workflow.decodedRgbSha256 ||
    !workflow.privateArtifactRef
  ) {
    throw new TextVideoPipelineError('PRUNA_ARTIFACT_INTEGRITY_FAILED');
  }
  return {
    privateArtifactRef: asPrivateStillArtifactRef(workflow.privateArtifactRef),
    sourceMime: workflow.sourceMime,
    sourceByteLength: workflow.sourceByteLength,
    sourceSha256: workflow.sourceSha256,
    canonicalMime: workflow.canonicalMime,
    canonicalByteLength: workflow.canonicalByteLength,
    canonicalSha256: workflow.canonicalSha256,
    decodedRgbSha256: workflow.decodedRgbSha256,
    width: workflow.width,
    height: workflow.height,
  };
}

function assertArtifactForWorkflow(
  artifact: CanonicalPrunaStillArtifact,
  workflow: MediaTextVideoWorkflowEntity,
): void {
  if (
    artifact.width !== workflow.width ||
    artifact.height !== workflow.height ||
    !SHA256.test(artifact.sourceSha256) ||
    !SHA256.test(artifact.canonicalSha256) ||
    !SHA256.test(artifact.decodedRgbSha256)
  ) {
    throw new TextVideoPipelineError('PRUNA_ARTIFACT_INTEGRITY_FAILED');
  }
}

function deterministicSeed(value: string): number {
  return createHash('sha256').update(value).digest().readUInt32BE(0);
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function hashCanonical(value: unknown): string {
  return sha256(canonicalJson(value));
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function elapsedMs(startedAt: number, endedAt: Date): number {
  return Math.max(0, Math.min(4_294_967_295, endedAt.getTime() - startedAt));
}

function mapPipelineError(error: unknown): TextVideoPipelineError {
  if (error instanceof TextVideoPipelineError) {
    return error;
  }
  if (error instanceof PrunaPImageClientError) {
    return new TextVideoPipelineError(
      error.metadata.reasonCode,
      error.metadata.retryable,
    );
  }
  if (error instanceof CascadeLtxI2vProviderError) {
    return new TextVideoPipelineError(error.reasonCode, error.retryable);
  }
  if (error instanceof CascadeLtxI2VPayloadError) {
    return new TextVideoPipelineError(error.reasonCode);
  }
  if (error instanceof TextVideoWorkflowPersistenceError) {
    return new TextVideoPipelineError(
      error.reasonCode,
      error.reasonCode === 'TEXT_VIDEO_WORKFLOW_PERSISTENCE_FAILED',
    );
  }
  if (error instanceof TextVideoWorkflowError) {
    return new TextVideoPipelineError(
      error.reasonCode === 'TEXT_VIDEO_WORKFLOW_VERSION_CONFLICT'
        ? 'LTX_CASCADE_RESUME_CONFLICT'
        : error.reasonCode,
      error.reasonCode === 'TEXT_VIDEO_WORKFLOW_VERSION_CONFLICT',
    );
  }
  const reasonCode =
    error &&
    typeof error === 'object' &&
    typeof (error as { reasonCode?: unknown }).reasonCode === 'string'
      ? (error as { reasonCode: string }).reasonCode
      : 'LTX_CASCADE_INTERNAL_ERROR';
  return new TextVideoPipelineError(safeReason(reasonCode));
}

function safeReason(reasonCode: string): string {
  return /^[A-Z][A-Z0-9_]{2,79}$/.test(reasonCode)
    ? reasonCode
    : 'LTX_CASCADE_INTERNAL_ERROR';
}
