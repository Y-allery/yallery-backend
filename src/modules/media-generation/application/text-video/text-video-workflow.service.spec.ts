import { TextVideoWorkflowSnapshot } from 'src/modules/media-generation/domain/contracts/text-video-workflow.contract';
import { MediaTextVideoWorkflowEntity } from 'src/modules/media-generation/persistence/entities/media-text-video-workflow.entity';
import {
  TextVideoWorkflowCasResult,
  TextVideoWorkflowCreateResult,
  TextVideoWorkflowMutation,
  TextVideoWorkflowRepository,
} from './text-video-workflow.repository';
import {
  CanonicalStillAdoption,
  TextVideoWorkflowService,
} from './text-video-workflow.service';

const TASK_ID = 'task_12345678';
const CHARGE_ID = 'charge_12345678';
const SUBMISSION_ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const RAW_PROMPT_SHA = 'a'.repeat(64);
const STILL_PROMPT_SHA = 'b'.repeat(64);
const MOTION_PROMPT_SHA = 'c'.repeat(64);
const STILL_REQUEST_SHA = 'd'.repeat(64);
const SOURCE_SHA = 'e'.repeat(64);
const CANONICAL_SHA = 'f'.repeat(64);
const RGB_SHA = '1'.repeat(64);
const I2V_REQUEST_SHA = '2'.repeat(64);
const VIDEO_SHA = '3'.repeat(64);

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

class InMemoryTextVideoWorkflowRepository
  implements TextVideoWorkflowRepository
{
  private readonly workflows = new Map<string, MediaTextVideoWorkflowEntity>();
  private sequence = 1;
  compareAndSwapCalls = 0;

  async createOrLoad(
    snapshot: Readonly<TextVideoWorkflowSnapshot>,
  ): Promise<TextVideoWorkflowCreateResult> {
    const existing = this.workflows.get(snapshot.taskId);
    if (existing) {
      return { workflow: cloneWorkflow(existing), created: false };
    }
    const nulls = Object.fromEntries(
      NULLABLE_FIELDS.map((field) => [field, null]),
    );
    const timestamp = new Date('2026-07-23T10:00:00.000Z');
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
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ) as MediaTextVideoWorkflowEntity;
    this.workflows.set(snapshot.taskId, workflow);
    return { workflow: cloneWorkflow(workflow), created: true };
  }

  async findByTaskId(
    taskId: string,
  ): Promise<MediaTextVideoWorkflowEntity | null> {
    const workflow = this.workflows.get(taskId);
    return workflow ? cloneWorkflow(workflow) : null;
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
      .map((workflow) => cloneWorkflow(workflow));
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
      .map((workflow) => cloneWorkflow(workflow));
  }

  async compareAndSwap(params: {
    taskId: string;
    expectedVersion: number;
    expectedStates: readonly MediaTextVideoWorkflowEntity['state'][];
    mutation: Readonly<TextVideoWorkflowMutation>;
  }): Promise<TextVideoWorkflowCasResult> {
    this.compareAndSwapCalls += 1;
    const current = this.workflows.get(params.taskId);
    if (!current) {
      return { outcome: 'not_found' };
    }
    if (
      current.version !== params.expectedVersion ||
      !params.expectedStates.includes(current.state)
    ) {
      return { outcome: 'conflict', workflow: cloneWorkflow(current) };
    }

    this.assertUniqueAdoption(current.taskId, params.mutation);
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
    return { outcome: 'applied', workflow: cloneWorkflow(next) };
  }

  private assertUniqueAdoption(
    taskId: string,
    mutation: Readonly<TextVideoWorkflowMutation>,
  ): void {
    const uniqueValues: Array<
      [
        'providerPredictionId' | 'runpodJobId' | 'finalPostId',
        string | number | null | undefined,
      ]
    > = [
      ['providerPredictionId', mutation.providerPredictionId],
      ['runpodJobId', mutation.runpodJobId],
      ['finalPostId', mutation.finalPostId],
    ];
    for (const [field, value] of uniqueValues) {
      if (value === null || value === undefined) {
        continue;
      }
      for (const [candidateTaskId, workflow] of this.workflows) {
        if (candidateTaskId !== taskId && workflow[field] === value) {
          throw new Error('UNIQUE_CONSTRAINT');
        }
      }
    }
  }
}

function cloneWorkflow(
  workflow: MediaTextVideoWorkflowEntity,
): MediaTextVideoWorkflowEntity {
  return Object.assign(new MediaTextVideoWorkflowEntity(), workflow);
}

function snapshot(
  overrides: Partial<TextVideoWorkflowSnapshot> = {},
): TextVideoWorkflowSnapshot {
  return {
    taskId: TASK_ID,
    userId: 42,
    chargeId: CHARGE_ID,
    contestSubmissionId: 77,
    pipelineMode: 'cascade',
    pipelineConfigVersion: 'cascade-v1',
    prunaClientPolicySha256: 'f'.repeat(64),
    promptCompilerVersion: 'compiler-v1',
    stillQcPolicyVersion: 'still-qc-v1',
    videoQcPolicyVersion: 'video-qc-v1',
    cascadeRunpodEndpointId: 'cascade_endpoint_12345678',
    cascadeRunpodApiKeyConfigKey: 'LTX_TEXT_CASCADE_RUNPOD_API_KEY',
    artifactTtlMs: 86_400_000,
    stillPollIntervalMs: 1_000,
    stillTotalTimeoutMs: 120_000,
    i2vPollIntervalMs: 1_000,
    i2vTotalTimeoutMs: 600_000,
    rawPromptSha256: RAW_PROMPT_SHA,
    stillPromptSha256: STILL_PROMPT_SHA,
    motionPromptSha256: MOTION_PROMPT_SHA,
    width: 1280,
    height: 704,
    frames: 121,
    fps: 24,
    stillSeed: 33102,
    videoSeed: 93102,
    stillProvider: 'pruna_p_image',
    stillModel: 'p-image',
    ...overrides,
  };
}

function artifact(
  overrides: Partial<CanonicalStillAdoption> = {},
): CanonicalStillAdoption {
  return {
    sourceMime: 'image/jpeg',
    sourceByteLength: 100_000,
    sourceSha256: SOURCE_SHA,
    canonicalMime: 'image/png',
    canonicalByteLength: 200_000,
    canonicalSha256: CANONICAL_SHA,
    decodedRgbSha256: RGB_SHA,
    privateArtifactRef: 'private_artifact_123456789',
    artifactDeleteAfter: new Date('2026-07-24T10:00:00.000Z'),
    stillDownloadDurationMs: 50,
    stillCanonicalizeDurationMs: 75,
    ...overrides,
  };
}

function serviceFor(repository: InMemoryTextVideoWorkflowRepository) {
  let tick = Date.parse('2026-07-23T10:00:00.000Z');
  return new TextVideoWorkflowService(repository, () => new Date((tick += 1)));
}

async function reachPlanned(
  service: TextVideoWorkflowService,
): Promise<MediaTextVideoWorkflowEntity> {
  let workflow = await service.createOrLoad(snapshot());
  workflow = await service.advancePlanning(
    workflow.taskId,
    workflow.version,
    'COMPILING',
  );
  return service.advancePlanning(workflow.taskId, workflow.version, 'PLANNED');
}

async function reachStillRunning(
  service: TextVideoWorkflowService,
): Promise<MediaTextVideoWorkflowEntity> {
  let workflow = await reachPlanned(service);
  workflow = await service.prepareStillSubmission({
    taskId: workflow.taskId,
    expectedVersion: workflow.version,
    submissionAttemptId: SUBMISSION_ATTEMPT_ID,
    stillRequestSha256: STILL_REQUEST_SHA,
  });
  const claim = await service.claimStillSubmissionDispatch({
    taskId: workflow.taskId,
    expectedVersion: workflow.version,
    submissionAttemptId: SUBMISSION_ATTEMPT_ID,
  });
  expect(claim.disposition).toBe('submit_once');
  return service.recordStillSubmissionAccepted({
    taskId: workflow.taskId,
    expectedVersion: claim.workflow.version,
    submissionAttemptId: SUBMISSION_ATTEMPT_ID,
    predictionId: 'prediction_12345678',
    stillSubmitDurationMs: 25,
  });
}

async function reachStillCanonicalized(
  service: TextVideoWorkflowService,
): Promise<MediaTextVideoWorkflowEntity> {
  let workflow = await reachStillRunning(service);
  workflow = await service.markStillReady({
    taskId: workflow.taskId,
    expectedVersion: workflow.version,
    stillPollDurationMs: 100,
  });
  return service.adoptCanonicalArtifact({
    taskId: workflow.taskId,
    expectedVersion: workflow.version,
    artifact: artifact(),
  });
}

async function reachStillAccepted(
  service: TextVideoWorkflowService,
): Promise<MediaTextVideoWorkflowEntity> {
  let workflow = await reachStillCanonicalized(service);
  workflow = await service.beginStillQc(workflow.taskId, workflow.version);
  return service.recordStillQc({
    taskId: workflow.taskId,
    expectedVersion: workflow.version,
    decision: 'pass',
    reasonCode: null,
    durationMs: 30,
  });
}

async function reachVideoAccepted(
  service: TextVideoWorkflowService,
): Promise<MediaTextVideoWorkflowEntity> {
  let workflow = await reachStillAccepted(service);
  workflow = await service.prepareI2vSubmission({
    taskId: workflow.taskId,
    expectedVersion: workflow.version,
    i2vRequestSha256: I2V_REQUEST_SHA,
  });
  const claim = await service.claimI2vSubmissionDispatch({
    taskId: workflow.taskId,
    expectedVersion: workflow.version,
    i2vRequestSha256: I2V_REQUEST_SHA,
  });
  expect(claim.disposition).toBe('submit_once');
  workflow = await service.adoptRunpodJob({
    taskId: workflow.taskId,
    expectedVersion: claim.workflow.version,
    i2vRequestSha256: I2V_REQUEST_SHA,
    runpodJobId: 'runpod_job_12345678',
  });
  workflow = await service.markVideoReady({
    taskId: workflow.taskId,
    expectedVersion: workflow.version,
    videoArtifactSha256: VIDEO_SHA,
    videoPrivateArtifactRef: `video_stage_${'4'.repeat(64)}`,
    videoArtifactByteLength: 1_000_000,
    videoWidth: 1280,
    videoHeight: 704,
    videoHasAudio: true,
    videoArtifactDeleteAfter: new Date('2026-07-24T10:00:00.000Z'),
    i2vDurationMs: 2_000,
  });
  workflow = await service.beginVideoQc(workflow.taskId, workflow.version);
  return service.recordVideoQc({
    taskId: workflow.taskId,
    expectedVersion: workflow.version,
    decision: 'pass',
    reasonCode: null,
    durationMs: 40,
  });
}

describe('TextVideoWorkflowService', () => {
  it('persists the immutable enqueue snapshot and rejects conflicting reuse', async () => {
    const repository = new InMemoryTextVideoWorkflowRepository();
    const firstService = serviceFor(repository);
    const first = await firstService.createOrLoad(snapshot());
    const duplicate = await serviceFor(repository).createOrLoad(snapshot());

    expect(duplicate.id).toBe(first.id);
    expect(duplicate.version).toBe(0);
    await expect(
      firstService.createOrLoad(snapshot({ userId: 43 })),
    ).rejects.toMatchObject({
      reasonCode: 'TEXT_VIDEO_WORKFLOW_SNAPSHOT_CONFLICT',
    });
  });

  it('rejects unexpected snapshot fields before persistence without leaking them', async () => {
    const repository = new InMemoryTextVideoWorkflowRepository();
    const service = serviceFor(repository);
    const secretPrompt = 'private prompt that must never persist';
    const unsafe = {
      ...snapshot(),
      prompt: secretPrompt,
    } as unknown as TextVideoWorkflowSnapshot;

    let captured: unknown;
    try {
      await service.createOrLoad(unsafe);
    } catch (error) {
      captured = error;
    }
    expect(captured).toMatchObject({
      reasonCode: 'TEXT_VIDEO_WORKFLOW_INVALID_INPUT',
    });
    expect(JSON.stringify(captured)).not.toContain(secretPrompt);
    expect(await repository.findByTaskId(TASK_ID)).toBeNull();
  });

  it('resumes safely after a crash before the still dispatch claim', async () => {
    const repository = new InMemoryTextVideoWorkflowRepository();
    let workflow = await reachPlanned(serviceFor(repository));
    workflow = await serviceFor(repository).prepareStillSubmission({
      taskId: workflow.taskId,
      expectedVersion: workflow.version,
      submissionAttemptId: SUBMISSION_ATTEMPT_ID,
      stillRequestSha256: STILL_REQUEST_SHA,
    });

    const directive = await serviceFor(repository).getResumeDirective(TASK_ID);
    expect(directive.action).toBe('CLAIM_STILL_SUBMISSION');
    expect(directive.workflow.version).toBe(workflow.version);
  });

  it('allows exactly one concurrent still submission dispatch', async () => {
    const repository = new InMemoryTextVideoWorkflowRepository();
    const service = serviceFor(repository);
    let workflow = await reachPlanned(service);
    workflow = await service.prepareStillSubmission({
      taskId: workflow.taskId,
      expectedVersion: workflow.version,
      submissionAttemptId: SUBMISSION_ATTEMPT_ID,
      stillRequestSha256: STILL_REQUEST_SHA,
    });

    const claims = await Promise.all([
      service.claimStillSubmissionDispatch({
        taskId: workflow.taskId,
        expectedVersion: workflow.version,
        submissionAttemptId: SUBMISSION_ATTEMPT_ID,
      }),
      service.claimStillSubmissionDispatch({
        taskId: workflow.taskId,
        expectedVersion: workflow.version,
        submissionAttemptId: SUBMISSION_ATTEMPT_ID,
      }),
    ]);
    expect(claims.map((claim) => claim.disposition).sort()).toEqual([
      'do_not_submit',
      'submit_once',
    ]);
    expect(
      claims.find((claim) => claim.disposition === 'do_not_submit'),
    ).toMatchObject({
      reasonCode: 'TEXT_VIDEO_WORKFLOW_NO_RESUBMIT',
    });
  });

  it('fails closed after a crash beyond the still dispatch boundary and refunds once', async () => {
    const repository = new InMemoryTextVideoWorkflowRepository();
    const service = serviceFor(repository);
    let workflow = await reachPlanned(service);
    workflow = await service.prepareStillSubmission({
      taskId: workflow.taskId,
      expectedVersion: workflow.version,
      submissionAttemptId: SUBMISSION_ATTEMPT_ID,
      stillRequestSha256: STILL_REQUEST_SHA,
    });
    const claim = await service.claimStillSubmissionDispatch({
      taskId: workflow.taskId,
      expectedVersion: workflow.version,
      submissionAttemptId: SUBMISSION_ATTEMPT_ID,
    });

    const restarted = serviceFor(repository);
    expect((await restarted.getResumeDirective(TASK_ID)).action).toBe(
      'FAIL_STILL_SUBMISSION_UNCERTAIN',
    );
    workflow = await restarted.recordStillSubmissionUncertain({
      taskId: TASK_ID,
      expectedVersion: claim.workflow.version,
      submissionAttemptId: SUBMISSION_ATTEMPT_ID,
    });
    workflow = await restarted.failWorkflow({
      taskId: TASK_ID,
      expectedVersion: workflow.version,
      reasonCode: 'PRUNA_SUBMISSION_UNCERTAIN',
    });
    expect(workflow).toMatchObject({
      state: 'FAILED',
      refundStatus: 'required',
      finalPostId: null,
    });
    expect(await restarted.getResumeDirective(TASK_ID)).toMatchObject({
      action: 'REFUND',
      idempotencyKey: CHARGE_ID,
    });

    const refunded = await restarted.markRefundCompleted(
      TASK_ID,
      workflow.version,
    );
    const duplicate = await restarted.markRefundCompleted(
      TASK_ID,
      workflow.version,
    );
    expect(duplicate.version).toBe(refunded.version);
    expect(duplicate.refundStatus).toBe('completed');
    expect((await restarted.getResumeDirective(TASK_ID)).action).toBe('DONE');
  });

  it('adopts accepted prediction and canonical artifact idempotently', async () => {
    const repository = new InMemoryTextVideoWorkflowRepository();
    const service = serviceFor(repository);
    let workflow = await reachStillRunning(service);
    const duplicatePrediction = await service.recordStillSubmissionAccepted({
      taskId: workflow.taskId,
      expectedVersion: workflow.version - 1,
      submissionAttemptId: SUBMISSION_ATTEMPT_ID,
      predictionId: 'prediction_12345678',
      stillSubmitDurationMs: 999,
    });
    expect(duplicatePrediction.version).toBe(workflow.version);

    workflow = await service.markStillReady({
      taskId: workflow.taskId,
      expectedVersion: workflow.version,
      stillPollDurationMs: 100,
    });
    const adopted = await service.adoptCanonicalArtifact({
      taskId: workflow.taskId,
      expectedVersion: workflow.version,
      artifact: artifact(),
    });
    const duplicateArtifact = await serviceFor(
      repository,
    ).adoptCanonicalArtifact({
      taskId: workflow.taskId,
      expectedVersion: workflow.version,
      artifact: artifact(),
    });
    expect(duplicateArtifact.version).toBe(adopted.version);
    expect((await service.getResumeDirective(TASK_ID)).action).toBe(
      'RUN_STILL_QC',
    );
    await expect(
      service.adoptCanonicalArtifact({
        taskId: workflow.taskId,
        expectedVersion: adopted.version,
        artifact: artifact({ canonicalSha256: '4'.repeat(64) }),
      }),
    ).rejects.toMatchObject({
      reasonCode: 'TEXT_VIDEO_WORKFLOW_INVARIANT_MISMATCH',
    });
  });

  it('adopts equivalent concurrent preparation instead of surfacing a CAS conflict', async () => {
    const repository = new InMemoryTextVideoWorkflowRepository();
    const service = serviceFor(repository);
    const workflow = await reachPlanned(service);
    const requests = [1, 2].map(() =>
      service.prepareStillSubmission({
        taskId: workflow.taskId,
        expectedVersion: workflow.version,
        submissionAttemptId: SUBMISSION_ATTEMPT_ID,
        stillRequestSha256: STILL_REQUEST_SHA,
      }),
    );

    const prepared = await Promise.all(requests);
    expect(prepared[0].version).toBe(prepared[1].version);
    expect(prepared[0].submissionAttemptId).toBe(SUBMISSION_ATTEMPT_ID);
  });

  it('rejects stale, non-idempotent transitions with optimistic CAS conflict', async () => {
    const repository = new InMemoryTextVideoWorkflowRepository();
    const service = serviceFor(repository);
    const planned = await reachPlanned(service);
    await service.prepareStillSubmission({
      taskId: planned.taskId,
      expectedVersion: planned.version,
      submissionAttemptId: SUBMISSION_ATTEMPT_ID,
      stillRequestSha256: STILL_REQUEST_SHA,
    });

    await expect(
      service.advancePlanning(planned.taskId, planned.version, 'COMPILING'),
    ).rejects.toMatchObject({
      reasonCode: 'TEXT_VIDEO_WORKFLOW_VERSION_CONFLICT',
    });
  });

  it('stops on still QC rejection before I2V and records one refund marker', async () => {
    const repository = new InMemoryTextVideoWorkflowRepository();
    const service = serviceFor(repository);
    let workflow = await reachStillCanonicalized(service);
    workflow = await service.beginStillQc(workflow.taskId, workflow.version);
    workflow = await service.recordStillQc({
      taskId: workflow.taskId,
      expectedVersion: workflow.version,
      decision: 'reject',
      reasonCode: 'STILL_QC_EXTRA_PERSON',
      durationMs: 30,
    });

    expect(workflow).toMatchObject({
      state: 'FAILED',
      refundStatus: 'required',
      runpodJobId: null,
      finalPostId: null,
    });
    await expect(
      service.prepareI2vSubmission({
        taskId: workflow.taskId,
        expectedVersion: workflow.version,
        i2vRequestSha256: I2V_REQUEST_SHA,
      }),
    ).rejects.toMatchObject({
      reasonCode: 'TEXT_VIDEO_WORKFLOW_INVALID_TRANSITION',
    });
  });

  it('allows exactly one I2V dispatch and fails closed after its claim', async () => {
    const repository = new InMemoryTextVideoWorkflowRepository();
    const service = serviceFor(repository);
    let workflow = await reachStillAccepted(service);
    workflow = await service.prepareI2vSubmission({
      taskId: workflow.taskId,
      expectedVersion: workflow.version,
      i2vRequestSha256: I2V_REQUEST_SHA,
    });
    const claims = await Promise.all([
      service.claimI2vSubmissionDispatch({
        taskId: workflow.taskId,
        expectedVersion: workflow.version,
        i2vRequestSha256: I2V_REQUEST_SHA,
      }),
      service.claimI2vSubmissionDispatch({
        taskId: workflow.taskId,
        expectedVersion: workflow.version,
        i2vRequestSha256: I2V_REQUEST_SHA,
      }),
    ]);
    expect(claims.map((claim) => claim.disposition).sort()).toEqual([
      'do_not_submit',
      'submit_once',
    ]);

    const directive = await serviceFor(repository).getResumeDirective(TASK_ID);
    expect(directive.action).toBe('FAIL_I2V_SUBMISSION_UNCERTAIN');
    const failed = await service.failWorkflow({
      taskId: TASK_ID,
      expectedVersion: directive.workflow.version,
      reasonCode: 'RUNPOD_SUBMISSION_UNCERTAIN',
    });
    expect(failed).toMatchObject({
      state: 'FAILED',
      refundStatus: 'required',
      runpodJobId: null,
    });
  });

  it('completes the full workflow with one idempotent final post and no refund', async () => {
    const repository = new InMemoryTextVideoWorkflowRepository();
    const service = serviceFor(repository);
    let workflow = await reachVideoAccepted(service);
    const finalization = await service.claimFinalization(
      workflow.taskId,
      workflow.version,
    );
    expect(finalization).toMatchObject({
      disposition: 'finalize_idempotently',
      idempotencyKey: TASK_ID,
    });
    const duplicateClaim = await serviceFor(repository).claimFinalization(
      workflow.taskId,
      workflow.version,
    );
    expect(duplicateClaim.idempotencyKey).toBe(TASK_ID);
    expect(duplicateClaim.workflow.version).toBe(finalization.workflow.version);

    workflow = await service.completeFinalization({
      taskId: workflow.taskId,
      expectedVersion: finalization.workflow.version,
      finalPostId: 987,
      totalDurationMs: 2_500,
    });
    const duplicate = await service.completeFinalization({
      taskId: workflow.taskId,
      expectedVersion: finalization.workflow.version,
      finalPostId: 987,
      totalDurationMs: 9_999,
    });
    expect(duplicate.version).toBe(workflow.version);
    expect(duplicate).toMatchObject({
      state: 'COMPLETED',
      finalPostId: 987,
      refundStatus: 'none',
      failedAt: null,
    });
    expect((await service.getResumeDirective(TASK_ID)).action).toBe('DONE');
    await expect(
      service.completeFinalization({
        taskId: workflow.taskId,
        expectedVersion: workflow.version,
        finalPostId: 988,
        totalDurationMs: 2_500,
      }),
    ).rejects.toMatchObject({
      reasonCode: 'TEXT_VIDEO_WORKFLOW_INVARIANT_MISMATCH',
    });
  });

  it('never switches a finalizing workflow into refund state', async () => {
    const repository = new InMemoryTextVideoWorkflowRepository();
    const service = serviceFor(repository);
    const workflow = await reachVideoAccepted(service);
    const claim = await service.claimFinalization(
      workflow.taskId,
      workflow.version,
    );

    await expect(
      service.failWorkflow({
        taskId: workflow.taskId,
        expectedVersion: claim.workflow.version,
        reasonCode: 'FINAL_POST_RESULT_UNCERTAIN',
      }),
    ).rejects.toMatchObject({
      reasonCode: 'TEXT_VIDEO_WORKFLOW_INVALID_TRANSITION',
    });
    const persisted = await service.getByTaskId(TASK_ID);
    expect(persisted).toMatchObject({
      state: 'FINALIZING',
      refundStatus: 'none',
      finalPostId: null,
    });
  });
});
