import { createHash } from 'crypto';
import * as sharp from 'sharp';
import { MediaTextVideoJobData } from 'src/modules/media-generation/domain/contracts/media-text-video-job-data.contract';
import { TextVideoWorkflowSnapshot } from 'src/modules/media-generation/domain/contracts/text-video-workflow.contract';
import { MediaTextVideoWorkflowEntity } from 'src/modules/media-generation/persistence/entities/media-text-video-workflow.entity';
import { PrunaPImageClient } from 'src/modules/media-generation/infrastructure/providers/pruna/pruna-p-image.client';
import { asPrivateStillArtifactRef } from 'src/modules/media-generation/infrastructure/providers/pruna/pruna-still-artifact.store';
import { PrunaPImageClientError } from 'src/modules/media-generation/infrastructure/providers/pruna/pruna-p-image.types';
import {
  CascadeLtxI2VPayload,
  CascadeLtxI2VPayloadBuilder,
} from 'src/modules/media-generation/infrastructure/providers/runpod/cascade-ltx-i2v-payload.builder';
import { CascadeLtxI2vProviderError } from 'src/modules/media-generation/infrastructure/providers/runpod/cascade-ltx-i2v.provider';
import {
  TextVideoWorkflowCasResult,
  TextVideoWorkflowCreateResult,
  TextVideoWorkflowMutation,
  TextVideoWorkflowRepository,
} from './text-video-workflow.repository';
import {
  TextVideoWorkflowError,
  TextVideoWorkflowService,
} from './text-video-workflow.service';
import {
  TextVideoPipelineClock,
  TextVideoPipelineService,
} from './text-video-pipeline.service';
import { VerbatimTextVideoPromptCompiler } from './text-video-prompt-compiler';
import { CascadeLtxI2vRoute } from './text-video-pipeline.ports';

const TASK_ID = 'task_12345678';
const CHARGE_ID = 'charge_12345678';
const CANONICAL_SHA = 'c'.repeat(64);
const VIDEO_SHA = '9'.repeat(64);
const PRUNA_POLICY_SHA = 'd'.repeat(64);

const NULLABLE_FIELDS = [
  'terminalReasonCode',
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
] as const;

class InMemoryWorkflowRepository implements TextVideoWorkflowRepository {
  private readonly workflows = new Map<string, MediaTextVideoWorkflowEntity>();
  private sequence = 1;

  async createOrLoad(
    snapshot: Readonly<TextVideoWorkflowSnapshot>,
  ): Promise<TextVideoWorkflowCreateResult> {
    const existing = this.workflows.get(snapshot.taskId);
    if (existing) {
      return { workflow: clone(existing), created: false };
    }
    const nulls = Object.fromEntries(
      NULLABLE_FIELDS.map((field) => [field, null]),
    );
    const workflow = Object.assign(
      new MediaTextVideoWorkflowEntity(),
      nulls,
      snapshot,
      {
        id: this.sequence++,
        state: 'QUEUED',
        version: 0,
        refundStatus: 'none',
        artifactCleanupStatus: 'not_required',
        createdAt: new Date('2026-07-23T10:00:00.000Z'),
        updatedAt: new Date('2026-07-23T10:00:00.000Z'),
      },
    ) as MediaTextVideoWorkflowEntity;
    this.workflows.set(snapshot.taskId, workflow);
    return { workflow: clone(workflow), created: true };
  }

  async findByTaskId(
    taskId: string,
  ): Promise<MediaTextVideoWorkflowEntity | null> {
    const workflow = this.workflows.get(taskId);
    return workflow ? clone(workflow) : null;
  }

  async findCleanupDue(
    before: Date,
    limit: number,
  ): Promise<MediaTextVideoWorkflowEntity[]> {
    return [...this.workflows.values()]
      .filter(
        (workflow) =>
          workflow.artifactCleanupStatus === 'pending' &&
          workflow.artifactCleanupAfter !== null &&
          workflow.artifactCleanupAfter.getTime() <= before.getTime(),
      )
      .slice(0, limit)
      .map(clone);
  }

  async findStaleFinalizing(
    before: Date,
    limit: number,
  ): Promise<MediaTextVideoWorkflowEntity[]> {
    return [...this.workflows.values()]
      .filter(
        (workflow) =>
          workflow.state === 'FINALIZING' &&
          workflow.updatedAt.getTime() <= before.getTime(),
      )
      .slice(0, limit)
      .map(clone);
  }

  async compareAndSwap(params: {
    taskId: string;
    expectedVersion: number;
    expectedStates: readonly MediaTextVideoWorkflowEntity['state'][];
    mutation: Readonly<TextVideoWorkflowMutation>;
  }): Promise<TextVideoWorkflowCasResult> {
    const current = this.workflows.get(params.taskId);
    if (!current) {
      return { outcome: 'not_found' };
    }
    if (
      current.version !== params.expectedVersion ||
      !params.expectedStates.includes(current.state)
    ) {
      return { outcome: 'conflict', workflow: clone(current) };
    }
    const next = Object.assign(
      new MediaTextVideoWorkflowEntity(),
      current,
      params.mutation,
      {
        version: current.version + 1,
        updatedAt: new Date(current.updatedAt.getTime() + 1),
      },
    );
    this.workflows.set(current.taskId, next);
    return { outcome: 'applied', workflow: clone(next) };
  }
}

class FakeClock extends TextVideoPipelineClock {
  private tick = Date.parse('2026-07-23T10:00:00.000Z');

  now(): Date {
    return new Date((this.tick += 1));
  }

  async sleep(milliseconds: number): Promise<void> {
    this.tick += milliseconds;
  }
}

function clone(
  workflow: MediaTextVideoWorkflowEntity,
): MediaTextVideoWorkflowEntity {
  return Object.assign(new MediaTextVideoWorkflowEntity(), workflow);
}

function jobData(
  mode: 'native' | 'cascade' = 'cascade',
): MediaTextVideoJobData {
  return {
    request: {
      aiService: 'yengine_video_text',
      prompt: 'One dancer turns slowly in an empty studio.',
      orientation: 'horizontal',
      duration: 5,
      seed: 43103,
      contestId: 12,
      contestSubmissionId: 77,
    },
    userId: 42,
    aiService: 'yengine_video_text',
    chargeId: CHARGE_ID,
    ltxTextPipelineMode: mode,
  };
}

type HarnessOptions = {
  stillDecision?: 'pass' | 'reject';
  videoDecision?: 'pass' | 'reject';
  submissionUncertain?: boolean;
  failStillStatusOnce?: boolean;
  failStillMaterializationStatusOnce?: boolean;
  failI2vStatusOnce?: boolean;
  failMarkVideoReadyOnce?: boolean;
  failFinalizerAfterPostOnce?: boolean;
  ready?: boolean;
};

async function createHarness(options: HarnessOptions = {}) {
  const canonicalPng = await createCanonicalPng(1280, 704);
  const repository = new InMemoryWorkflowRepository();
  const workflows = new TextVideoWorkflowService(
    repository,
    () => new Date('2026-07-23T10:00:00.000Z'),
  );
  if (options.failMarkVideoReadyOnce) {
    const markVideoReady = workflows.markVideoReady.bind(workflows);
    let fail = true;
    jest
      .spyOn(workflows, 'markVideoReady')
      .mockImplementation(async (params) => {
        if (fail) {
          fail = false;
          throw new TextVideoWorkflowError(
            'TEXT_VIDEO_WORKFLOW_VERSION_CONFLICT',
          );
        }
        return markVideoReady(params);
      });
  }
  const runtimeSnapshot = {
    enabled: options.ready ?? true,
    pipelineConfigVersion: 'cascade-v1',
    prunaClientPolicySha256: PRUNA_POLICY_SHA,
    promptCompilerVersion: 'verbatim-v1',
    stillQcEnabled: true,
    stillQcPolicyVersion: 'still-qc-v1',
    videoQcEnabled: true,
    videoQcPolicyVersion: 'video-qc-v1',
    artifactTtlMs: 86_400_000,
    stillPollIntervalMs: 1,
    stillTotalTimeoutMs: 100,
    i2vPollIntervalMs: 1,
    i2vTotalTimeoutMs: 100,
    cascadeRunpodEndpointId: 'cascade_endpoint_12345678',
    cascadeRunpodApiKeyConfigKey: 'LTX_TEXT_CASCADE_RUNPOD_API_KEY' as const,
    cascadeRunpodReady: options.ready ?? true,
    prunaEnabled: true,
    prunaModel: 'p-image' as const,
  };
  const runtimeConfig = {
    getRuntimeSnapshot: jest.fn(async () => runtimeSnapshot),
  };
  const requestHasher = new PrunaPImageClient({
    apiKey: 'test-pruna-key',
    pipelineConfigVersion: 'cascade-v1',
    allowedDownloadHosts: [],
  });
  let failStillStatus = Boolean(options.failStillStatusOnce);
  let stillStatusCalls = 0;
  const stillProvider = {
    submit: jest.fn(async (input) =>
      options.submissionUncertain
        ? {
            certainty: 'unknown' as const,
            reasonCode: 'PRUNA_SUBMISSION_UNCERTAIN' as const,
            requestHash: requestHasher.requestHash(
              requestHasher.buildRequest(input),
            ),
          }
        : {
            certainty: 'accepted' as const,
            predictionId: 'prediction_12345678',
            requestHash: requestHasher.requestHash(
              requestHasher.buildRequest(input),
            ),
          },
    ),
    getStatus: jest.fn(async (_predictionId: string) => {
      stillStatusCalls += 1;
      if (failStillStatus) {
        failStillStatus = false;
        throw new PrunaPImageClientError({
          stage: 'status',
          reasonCode: 'PRUNA_STATUS_UNAVAILABLE',
          retryable: true,
          certainty: 'accepted',
        });
      }
      if (
        options.failStillMaterializationStatusOnce &&
        stillStatusCalls === 2
      ) {
        throw new PrunaPImageClientError({
          stage: 'status',
          reasonCode: 'PRUNA_STATUS_UNAVAILABLE',
          retryable: true,
          certainty: 'accepted',
        });
      }
      return {
        status: 'succeeded' as const,
      };
    }),
    materialize: jest.fn(async (_request: { predictionId: string }) => ({
      privateArtifactRef: asPrivateStillArtifactRef(
        'private_artifact_123456789',
      ),
      sourceMime: 'image/jpeg' as const,
      sourceByteLength: 100_000,
      sourceSha256: 'a'.repeat(64),
      canonicalMime: 'image/png' as const,
      canonicalByteLength: canonicalPng.byteLength,
      canonicalSha256: createHash('sha256').update(canonicalPng).digest('hex'),
      decodedRgbSha256: 'b'.repeat(64),
      width: 1280 as const,
      height: 704 as const,
      downloadDurationMs: 7,
      canonicalizeDurationMs: 11,
    })),
    loadCanonicalBytes: jest.fn(async () => Buffer.from(canonicalPng)),
  };
  let capturedStillQcBytes: Buffer | null = null;
  const stillQc = {
    isConfigured: jest.fn(() => true),
    evaluate: jest.fn(async (input) => {
      capturedStillQcBytes = Buffer.from(input.canonicalPng);
      return options.stillDecision === 'reject'
        ? {
            decision: 'reject' as const,
            reasonCode: 'STILL_QC_EXTRA_PERSON',
            durationMs: 10,
          }
        : { decision: 'pass' as const, reasonCode: null, durationMs: 10 };
    }),
  };
  const videoQc = {
    isConfigured: jest.fn(() => true),
    evaluate: jest.fn(async () =>
      options.videoDecision === 'reject'
        ? {
            decision: 'reject' as const,
            reasonCode: 'VIDEO_QC_TEMPORAL_ARTIFACT',
            durationMs: 12,
          }
        : { decision: 'pass' as const, reasonCode: null, durationMs: 12 },
    ),
  };
  let failI2vStatus = Boolean(options.failI2vStatusOnce);
  const i2vProvider = {
    submit: jest.fn(
      async (_route: CascadeLtxI2vRoute, _payload: CascadeLtxI2VPayload) => ({
        certainty: 'accepted' as const,
        jobId: 'runpod_job_12345678',
      }),
    ),
    getStatus: jest.fn(async (_route: CascadeLtxI2vRoute) => {
      if (failI2vStatus) {
        failI2vStatus = false;
        throw new CascadeLtxI2vProviderError('RUNPOD_STATUS_UNAVAILABLE', true);
      }
      return { status: 'completed' as const };
    }),
    stageForQc: jest.fn(async (_route: CascadeLtxI2vRoute) => ({
      artifactSha256: VIDEO_SHA,
      privateArtifactRef: `video_stage_${'8'.repeat(64)}`,
      byteLength: 1_000_000,
      width: 1280,
      height: 704,
      hasAudio: true,
    })),
    loadStagedForQc: jest.fn(async (artifact) => ({
      artifact,
      mp4Bytes: Buffer.from('private-video-bytes'),
    })),
    publishOnce: jest.fn(async () => ({
      artifactSha256: VIDEO_SHA,
      result: {
        videoUrl: 'https://cdn.test/cascade.mp4',
        previewImageUrl: 'https://cdn.test/cascade.jpg',
        width: 1280,
        height: 704,
        hasAudio: true,
        rawOutput: { safe: true },
      },
    })),
    deleteStaged: jest.fn(async () => undefined),
  };
  const privateStore = {
    isConfigured: jest.fn(() => true),
    deleteCanonicalPng: jest.fn(async () => undefined),
  };
  let committedFinalPost = false;
  let failFinalizer = Boolean(options.failFinalizerAfterPostOnce);
  const finalizedResult = {
    data: [
      {
        id: 987,
        videoUrl: 'https://cdn.test/cascade.mp4',
        previewImageUrl: 'https://cdn.test/cascade.jpg',
      },
    ],
    rawOutput: { cascade: true },
  };
  const finalizer = {
    finalizeTextVideoGeneration: jest.fn(async () => ({
      data: [{ id: 111, videoUrl: 'https://cdn.test/native.mp4' }],
      rawOutput: { native: true },
    })),
    finalizeAcceptedTextVideoGeneration: jest.fn(async () => {
      committedFinalPost = true;
      if (failFinalizer) {
        failFinalizer = false;
        throw new Error('ACTIVITY_WRITE_TEMPORARILY_UNAVAILABLE');
      }
      return finalizedResult;
    }),
    reconcileAcceptedTextVideoGeneration: jest.fn(async () =>
      committedFinalPost ? finalizedResult : null,
    ),
    loadFinalizedTextVideoGeneration: jest.fn(async () => ({
      data: [{ id: 987, videoUrl: 'https://cdn.test/cascade.mp4' }],
      rawOutput: { adopted: true },
    })),
  };
  const balance = { refund: jest.fn(async () => undefined) };
  const contestFlow = {
    markSubmissionFailed: jest.fn(async () => undefined),
  };
  const pipeline = new TextVideoPipelineService(
    runtimeConfig as any,
    new VerbatimTextVideoPromptCompiler(),
    new CascadeLtxI2VPayloadBuilder(),
    workflows,
    stillProvider as any,
    stillQc,
    videoQc,
    i2vProvider,
    privateStore as any,
    finalizer as any,
    balance as any,
    contestFlow as any,
    new FakeClock(),
  );
  return {
    pipeline,
    workflows,
    stillProvider,
    stillQc,
    videoQc,
    i2vProvider,
    finalizer,
    balance,
    contestFlow,
    canonicalPng,
    getCapturedStillQcBytes: () => capturedStillQcBytes,
    setCascadeEndpoint: (endpointId: string) => {
      runtimeSnapshot.cascadeRunpodEndpointId = endpointId;
    },
    mutateRuntimeVersions: () => {
      runtimeSnapshot.pipelineConfigVersion = 'cascade-v999';
      runtimeSnapshot.prunaClientPolicySha256 = 'e'.repeat(64);
      runtimeSnapshot.promptCompilerVersion = 'compiler-v999';
      runtimeSnapshot.stillQcPolicyVersion = 'still-qc-v999';
      runtimeSnapshot.videoQcPolicyVersion = 'video-qc-v999';
      runtimeSnapshot.i2vPollIntervalMs = 99;
      runtimeSnapshot.i2vTotalTimeoutMs = 99;
    },
  };
}

describe('TextVideoPipelineService.runOrResume', () => {
  it('completes the fixed Pruna -> QC -> LTX I2V -> QC chain once', async () => {
    const harness = await createHarness();

    await expect(
      harness.pipeline.runOrResume(TASK_ID, jobData()),
    ).resolves.toMatchObject({
      data: [{ id: 987, videoUrl: 'https://cdn.test/cascade.mp4' }],
    });

    expect(harness.stillProvider.submit).toHaveBeenCalledTimes(1);
    expect(harness.i2vProvider.submit).toHaveBeenCalledTimes(1);
    const payload = harness.i2vProvider.submit.mock.calls[0][1];
    expect(payload).toMatchObject({
      prompt: jobData().request.prompt,
      width: 1280,
      height: 704,
      frames: 121,
      enhance: true,
      cas_amount: 0,
    });
    expect(payload.image_b64).toBe(harness.canonicalPng.toString('base64'));
    expect(harness.getCapturedStillQcBytes()).toEqual(harness.canonicalPng);
    expect(
      harness.finalizer.finalizeAcceptedTextVideoGeneration,
    ).toHaveBeenCalledTimes(1);
    await expect(harness.workflows.getByTaskId(TASK_ID)).resolves.toMatchObject(
      {
        state: 'COMPLETED',
        providerPredictionId: 'prediction_12345678',
        runpodJobId: 'runpod_job_12345678',
        finalPostId: 987,
        refundStatus: 'none',
        stillDownloadDurationMs: 7,
        stillCanonicalizeDurationMs: 11,
      },
    );
    const completedWorkflow = await harness.workflows.getByTaskId(TASK_ID);
    expect(completedWorkflow.totalDurationMs).toBeGreaterThan(0);

    await expect(
      harness.pipeline.runOrResume(TASK_ID, jobData()),
    ).resolves.toMatchObject({ data: [{ id: 987 }] });
    expect(harness.stillProvider.submit).toHaveBeenCalledTimes(1);
    expect(harness.i2vProvider.submit).toHaveBeenCalledTimes(1);
    expect(
      harness.finalizer.finalizeAcceptedTextVideoGeneration,
    ).toHaveBeenCalledTimes(1);
  });

  it('fails and refunds a still-QC rejection without submitting LTX', async () => {
    const harness = await createHarness({ stillDecision: 'reject' });

    await expect(
      harness.pipeline.runOrResume(TASK_ID, jobData()),
    ).rejects.toMatchObject({ reasonCode: 'STILL_QC_EXTRA_PERSON' });
    expect(harness.i2vProvider.submit).not.toHaveBeenCalled();
    expect(
      harness.finalizer.finalizeAcceptedTextVideoGeneration,
    ).not.toHaveBeenCalled();
    expect(harness.balance.refund).toHaveBeenCalledTimes(1);
    expect(harness.contestFlow.markSubmissionFailed).toHaveBeenCalledTimes(1);
    await expect(harness.workflows.getByTaskId(TASK_ID)).resolves.toMatchObject(
      {
        state: 'FAILED',
        refundStatus: 'completed',
        runpodJobId: null,
        finalPostId: null,
      },
    );
  });

  it('fails and refunds a video-QC rejection without creating a post', async () => {
    const harness = await createHarness({ videoDecision: 'reject' });

    await expect(
      harness.pipeline.runOrResume(TASK_ID, jobData()),
    ).rejects.toMatchObject({
      reasonCode: 'VIDEO_QC_TEMPORAL_ARTIFACT',
    });
    expect(harness.i2vProvider.submit).toHaveBeenCalledTimes(1);
    expect(
      harness.finalizer.finalizeAcceptedTextVideoGeneration,
    ).not.toHaveBeenCalled();
    expect(harness.balance.refund).toHaveBeenCalledTimes(1);
    expect(harness.contestFlow.markSubmissionFailed).toHaveBeenCalledTimes(1);
    await expect(harness.workflows.getByTaskId(TASK_ID)).resolves.toMatchObject(
      {
        state: 'FAILED',
        refundStatus: 'completed',
        runpodJobId: 'runpod_job_12345678',
        finalPostId: null,
      },
    );
  });

  it('never resubmits after an uncertain Pruna POST boundary', async () => {
    const harness = await createHarness({ submissionUncertain: true });

    await expect(
      harness.pipeline.runOrResume(TASK_ID, jobData()),
    ).rejects.toMatchObject({
      reasonCode: 'PRUNA_SUBMISSION_UNCERTAIN',
    });
    await expect(
      harness.pipeline.runOrResume(TASK_ID, jobData()),
    ).rejects.toMatchObject({
      reasonCode: 'PRUNA_SUBMISSION_UNCERTAIN',
    });
    expect(harness.stillProvider.submit).toHaveBeenCalledTimes(1);
    expect(harness.i2vProvider.submit).not.toHaveBeenCalled();
    expect(harness.balance.refund).toHaveBeenCalledTimes(1);
    expect(harness.contestFlow.markSubmissionFailed).toHaveBeenCalledTimes(1);
  });

  it('resumes the same persisted Pruna prediction and RunPod job after crashes', async () => {
    const harness = await createHarness({
      failStillStatusOnce: true,
      failI2vStatusOnce: true,
    });

    await expect(
      harness.pipeline.runOrResume(TASK_ID, jobData()),
    ).rejects.toMatchObject({
      reasonCode: 'PRUNA_STATUS_UNAVAILABLE',
      retryable: true,
    });
    await expect(harness.workflows.getByTaskId(TASK_ID)).resolves.toMatchObject(
      {
        state: 'STILL_RUNNING',
        providerPredictionId: 'prediction_12345678',
      },
    );
    harness.mutateRuntimeVersions();

    await expect(
      harness.pipeline.runOrResume(TASK_ID, jobData()),
    ).rejects.toMatchObject({
      reasonCode: 'RUNPOD_STATUS_UNAVAILABLE',
      retryable: true,
    });
    await expect(harness.workflows.getByTaskId(TASK_ID)).resolves.toMatchObject(
      {
        state: 'I2V_RUNNING',
        providerPredictionId: 'prediction_12345678',
        runpodJobId: 'runpod_job_12345678',
      },
    );

    await expect(
      harness.pipeline.runOrResume(TASK_ID, jobData()),
    ).resolves.toMatchObject({ data: [{ id: 987 }] });
    expect(harness.stillProvider.submit).toHaveBeenCalledTimes(1);
    expect(harness.i2vProvider.submit).toHaveBeenCalledTimes(1);
    expect(harness.stillProvider.submit).toHaveBeenCalledWith(
      expect.any(Object),
      PRUNA_POLICY_SHA,
    );
    for (const call of harness.stillProvider.getStatus.mock.calls) {
      expect(call).toEqual(expect.arrayContaining([PRUNA_POLICY_SHA]));
    }
    expect(harness.stillProvider.materialize).toHaveBeenCalledWith(
      expect.any(Object),
      PRUNA_POLICY_SHA,
    );
    expect(harness.balance.refund).not.toHaveBeenCalled();
  });

  it('re-fetches a fresh Pruna delivery reference after process-local state is lost', async () => {
    const harness = await createHarness({
      failStillMaterializationStatusOnce: true,
    });

    await expect(
      harness.pipeline.runOrResume(TASK_ID, jobData()),
    ).rejects.toMatchObject({
      reasonCode: 'PRUNA_STATUS_UNAVAILABLE',
      retryable: true,
    });
    await expect(harness.workflows.getByTaskId(TASK_ID)).resolves.toMatchObject(
      {
        state: 'STILL_READY',
        providerPredictionId: 'prediction_12345678',
        privateArtifactRef: null,
      },
    );

    await expect(
      harness.pipeline.runOrResume(TASK_ID, jobData()),
    ).resolves.toMatchObject({ data: [{ id: 987 }] });

    expect(harness.stillProvider.submit).toHaveBeenCalledTimes(1);
    expect(harness.stillProvider.getStatus).toHaveBeenCalledTimes(3);
    expect(harness.stillProvider.materialize).toHaveBeenCalledWith(
      expect.objectContaining({
        predictionId: 'prediction_12345678',
      }),
      PRUNA_POLICY_SHA,
    );
  });

  it('keeps the snapshotted cascade endpoint across a retry', async () => {
    const harness = await createHarness({ failI2vStatusOnce: true });

    await expect(
      harness.pipeline.runOrResume(TASK_ID, jobData()),
    ).rejects.toMatchObject({
      reasonCode: 'RUNPOD_STATUS_UNAVAILABLE',
      retryable: true,
    });
    harness.setCascadeEndpoint('replacement_endpoint_12345678');
    harness.mutateRuntimeVersions();
    await expect(
      harness.pipeline.runOrResume(TASK_ID, jobData()),
    ).resolves.toMatchObject({
      data: [{ id: 987 }],
    });

    expect(harness.i2vProvider.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointId: 'cascade_endpoint_12345678',
        apiKeyConfigKey: 'LTX_TEXT_CASCADE_RUNPOD_API_KEY',
      }),
      expect.any(Object),
    );
    for (const [route] of harness.i2vProvider.getStatus.mock.calls) {
      expect(route.endpointId).toBe('cascade_endpoint_12345678');
    }
    for (const [route] of harness.i2vProvider.stageForQc.mock.calls) {
      expect(route.endpointId).toBe('cascade_endpoint_12345678');
    }
  });

  it('resumes the same job after a crash between video storage and workflow adoption', async () => {
    const harness = await createHarness({ failMarkVideoReadyOnce: true });

    await expect(
      harness.pipeline.runOrResume(TASK_ID, jobData()),
    ).rejects.toMatchObject({
      reasonCode: 'LTX_CASCADE_RESUME_CONFLICT',
      retryable: true,
    });
    await expect(harness.workflows.getByTaskId(TASK_ID)).resolves.toMatchObject(
      {
        state: 'I2V_RUNNING',
        runpodJobId: 'runpod_job_12345678',
        videoArtifactSha256: null,
      },
    );

    await expect(
      harness.pipeline.runOrResume(TASK_ID, jobData()),
    ).resolves.toMatchObject({ data: [{ id: 987 }] });

    expect(harness.i2vProvider.submit).toHaveBeenCalledTimes(1);
    expect(harness.i2vProvider.stageForQc).toHaveBeenCalledTimes(2);
    expect(harness.i2vProvider.stageForQc.mock.calls[0]).toEqual(
      harness.i2vProvider.stageForQc.mock.calls[1],
    );
  });

  it('reconciles a committed post from FINALIZING without refund or RunPod reread', async () => {
    const harness = await createHarness({
      failFinalizerAfterPostOnce: true,
    });

    await expect(
      harness.pipeline.runOrResume(TASK_ID, jobData()),
    ).rejects.toMatchObject({
      reasonCode: 'LTX_CASCADE_INTERNAL_ERROR',
    });
    await expect(harness.workflows.getByTaskId(TASK_ID)).resolves.toMatchObject(
      {
        state: 'FINALIZING',
        refundStatus: 'none',
      },
    );
    const statusCalls = harness.i2vProvider.getStatus.mock.calls.length;
    const stageCalls = harness.i2vProvider.stageForQc.mock.calls.length;
    const publishCalls = harness.i2vProvider.publishOnce.mock.calls.length;

    await expect(
      harness.pipeline.runOrResume(TASK_ID, jobData()),
    ).resolves.toMatchObject({ data: [{ id: 987 }] });

    expect(harness.balance.refund).not.toHaveBeenCalled();
    expect(harness.i2vProvider.getStatus).toHaveBeenCalledTimes(statusCalls);
    expect(harness.i2vProvider.stageForQc).toHaveBeenCalledTimes(stageCalls);
    expect(harness.i2vProvider.publishOnce).toHaveBeenCalledTimes(publishCalls);
    expect(
      harness.finalizer.reconcileAcceptedTextVideoGeneration,
    ).toHaveBeenCalledTimes(1);
  });

  it('keeps an in-flight cascade snapshot while new COMEBACK-native work uses only native', async () => {
    const harness = await createHarness();

    await harness.pipeline.runOrResume(TASK_ID, jobData('cascade'));
    await expect(
      harness.pipeline.runOrResume('task_native_1234', jobData('native')),
    ).resolves.toMatchObject({
      data: [{ id: 111, videoUrl: 'https://cdn.test/native.mp4' }],
    });

    expect(harness.stillProvider.submit).toHaveBeenCalledTimes(1);
    expect(harness.i2vProvider.submit).toHaveBeenCalledTimes(1);
    expect(harness.finalizer.finalizeTextVideoGeneration).toHaveBeenCalledTimes(
      1,
    );
    expect(harness.finalizer.finalizeTextVideoGeneration).toHaveBeenCalledWith(
      jobData('native').request,
      42,
    );
  });

  it('fails closed before provider I/O when readiness dependencies are disabled', async () => {
    const harness = await createHarness({ ready: false });

    await expect(
      harness.pipeline.runOrResume(TASK_ID, jobData()),
    ).rejects.toMatchObject({
      reasonCode: 'LTX_CASCADE_NOT_CONFIGURED',
    });
    expect(harness.stillProvider.submit).not.toHaveBeenCalled();
    expect(harness.i2vProvider.submit).not.toHaveBeenCalled();
    expect(harness.balance.refund).toHaveBeenCalledTimes(1);
  });
});

async function createCanonicalPng(
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 20, g: 40, b: 60 },
    },
  })
    .png({
      compressionLevel: 9,
      adaptiveFiltering: false,
      palette: false,
    })
    .toBuffer();
}
