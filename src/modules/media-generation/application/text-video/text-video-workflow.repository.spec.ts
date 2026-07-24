import { Repository } from 'typeorm';
import { TextVideoWorkflowSnapshot } from 'src/modules/media-generation/domain/contracts/text-video-workflow.contract';
import { MediaTextVideoWorkflowEntity } from 'src/modules/media-generation/persistence/entities/media-text-video-workflow.entity';
import {
  TextVideoWorkflowPersistenceError,
  TypeOrmTextVideoWorkflowRepository,
} from './text-video-workflow.repository';

const TASK_ID = 'task_12345678';

function snapshot(): TextVideoWorkflowSnapshot {
  return {
    taskId: TASK_ID,
    userId: 42,
    chargeId: 'charge_12345678',
    contestSubmissionId: 77,
    pipelineMode: 'cascade',
    pipelineConfigVersion: 'cascade-v1',
    prunaClientPolicySha256: 'd'.repeat(64),
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
    rawPromptSha256: 'a'.repeat(64),
    stillPromptSha256: 'b'.repeat(64),
    motionPromptSha256: 'c'.repeat(64),
    width: 1280,
    height: 704,
    frames: 121,
    fps: 24,
    stillSeed: 33102,
    videoSeed: 93102,
    stillProvider: 'pruna_p_image',
    stillModel: 'p-image',
  };
}

function workflow(
  overrides: Partial<MediaTextVideoWorkflowEntity> = {},
): MediaTextVideoWorkflowEntity {
  return Object.assign(new MediaTextVideoWorkflowEntity(), snapshot(), {
    id: 1,
    state: 'QUEUED',
    version: 0,
    terminalReasonCode: null,
    refundStatus: 'none',
    createdAt: new Date('2026-07-23T10:00:00.000Z'),
    updatedAt: new Date('2026-07-23T10:00:00.000Z'),
    ...overrides,
  });
}

function repositoryMock(params?: {
  insert?: jest.Mock;
  update?: jest.Mock;
  findOne?: jest.Mock;
  find?: jest.Mock;
}): jest.Mocked<Repository<MediaTextVideoWorkflowEntity>> {
  return {
    insert: params?.insert ?? jest.fn(async () => ({ identifiers: [] })),
    update:
      params?.update ??
      jest.fn(async () => ({ generatedMaps: [], raw: [], affected: 1 })),
    findOne: params?.findOne ?? jest.fn(async () => workflow({ version: 1 })),
    find: params?.find ?? jest.fn(async () => []),
  } as unknown as jest.Mocked<Repository<MediaTextVideoWorkflowEntity>>;
}

describe('TypeOrmTextVideoWorkflowRepository', () => {
  it('classifies persistence outages as retryable and invalid mutations as permanent', () => {
    expect(
      new TextVideoWorkflowPersistenceError(
        'TEXT_VIDEO_WORKFLOW_PERSISTENCE_FAILED',
      ),
    ).toMatchObject({
      reasonCode: 'TEXT_VIDEO_WORKFLOW_PERSISTENCE_FAILED',
      retryable: true,
    });
    expect(
      new TextVideoWorkflowPersistenceError(
        'TEXT_VIDEO_WORKFLOW_MUTATION_INVALID',
      ),
    ).toMatchObject({
      reasonCode: 'TEXT_VIDEO_WORKFLOW_MUTATION_INVALID',
      retryable: false,
    });
  });

  it('inserts only the explicit safe snapshot fields', async () => {
    const orm = repositoryMock();
    const repository = new TypeOrmTextVideoWorkflowRepository(orm);
    const secret = 'raw private prompt';
    const unsafeSnapshot = {
      ...snapshot(),
      prompt: secret,
      providerResponse: { output: 'https://private.invalid/result' },
    } as unknown as TextVideoWorkflowSnapshot;

    await repository.createOrLoad(unsafeSnapshot);

    const inserted = orm.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted).toMatchObject({
      ...snapshot(),
      state: 'QUEUED',
      version: 0,
      terminalReasonCode: null,
      refundStatus: 'none',
    });
    expect(inserted).not.toHaveProperty('prompt');
    expect(inserted).not.toHaveProperty('providerResponse');
    expect(JSON.stringify(inserted)).not.toContain(secret);
  });

  it.each([
    { code: 'ER_DUP_ENTRY' },
    { code: 'SQLITE_CONSTRAINT' },
    { code: '23505' },
    { errno: 1062 },
  ])('adopts the durable row after a unique conflict: %j', async (error) => {
    const persisted = workflow();
    const orm = repositoryMock({
      insert: jest.fn(async () => {
        throw error;
      }),
      findOne: jest.fn(async () => persisted),
    });
    const repository = new TypeOrmTextVideoWorkflowRepository(orm);

    await expect(repository.createOrLoad(snapshot())).resolves.toEqual({
      workflow: persisted,
      created: false,
    });
  });

  it('maps unknown database failures to a stable safe reason only', async () => {
    const secret = 'INSERT with provider-token-and-prompt';
    const orm = repositoryMock({
      insert: jest.fn(async () => {
        throw new Error(secret);
      }),
    });
    const repository = new TypeOrmTextVideoWorkflowRepository(orm);

    let captured: unknown;
    try {
      await repository.createOrLoad(snapshot());
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(TextVideoWorkflowPersistenceError);
    expect(captured).toMatchObject({
      reasonCode: 'TEXT_VIDEO_WORKFLOW_PERSISTENCE_FAILED',
    });
    expect(JSON.stringify(captured)).not.toContain(secret);
  });

  it('updates by task, version and allowed state in one optimistic CAS', async () => {
    const persisted = workflow({
      state: 'COMPILING',
      version: 3,
    });
    const orm = repositoryMock({
      update: jest.fn(async () => ({ affected: 1 })),
      findOne: jest.fn(async () => persisted),
    });
    const repository = new TypeOrmTextVideoWorkflowRepository(orm);

    await expect(
      repository.compareAndSwap({
        taskId: TASK_ID,
        expectedVersion: 2,
        expectedStates: ['QUEUED'],
        mutation: { state: 'COMPILING' },
      }),
    ).resolves.toEqual({
      outcome: 'applied',
      workflow: persisted,
    });

    const [criteria, update] = orm.update.mock.calls[0];
    expect(criteria).toMatchObject({
      taskId: TASK_ID,
      version: 2,
    });
    expect(
      (
        criteria as unknown as {
          state: { _type: string; _value: string[] };
        }
      ).state,
    ).toMatchObject({
      _type: 'in',
      _value: ['QUEUED'],
    });
    expect(update).toEqual({
      state: 'COMPILING',
      version: 3,
    });
  });

  it('returns conflict or not_found without applying a stale transition', async () => {
    const persisted = workflow({
      state: 'STILL_RUNNING',
      version: 7,
    });
    const ormConflict = repositoryMock({
      update: jest.fn(async () => ({ affected: 0 })),
      findOne: jest.fn(async () => persisted),
    });
    const conflictRepository = new TypeOrmTextVideoWorkflowRepository(
      ormConflict,
    );
    await expect(
      conflictRepository.compareAndSwap({
        taskId: TASK_ID,
        expectedVersion: 6,
        expectedStates: ['STILL_SUBMITTING'],
        mutation: { state: 'STILL_RUNNING' },
      }),
    ).resolves.toEqual({ outcome: 'conflict', workflow: persisted });

    const ormMissing = repositoryMock({
      update: jest.fn(async () => ({ affected: 0 })),
      findOne: jest.fn(async () => null),
    });
    const missingRepository = new TypeOrmTextVideoWorkflowRepository(
      ormMissing,
    );
    await expect(
      missingRepository.compareAndSwap({
        taskId: TASK_ID,
        expectedVersion: 6,
        expectedStates: ['STILL_SUBMITTING'],
        mutation: { state: 'STILL_RUNNING' },
      }),
    ).resolves.toEqual({ outcome: 'not_found' });
  });

  it('finds stale FINALIZING work through the existing state/updatedAt index', async () => {
    const stale = workflow({
      state: 'FINALIZING',
      finalizingAt: new Date('2026-07-23T10:00:00.000Z'),
      updatedAt: new Date('2026-07-23T10:00:00.000Z'),
    });
    const orm = repositoryMock({
      find: jest.fn(async () => [stale]),
    });
    const repository = new TypeOrmTextVideoWorkflowRepository(orm);
    const before = new Date('2026-07-23T10:15:00.000Z');

    await expect(repository.findStaleFinalizing(before, 25)).resolves.toEqual([
      stale,
    ]);
    expect(orm.find).toHaveBeenCalledWith({
      where: {
        state: 'FINALIZING',
        updatedAt: expect.objectContaining({
          _type: 'lessThanOrEqual',
          _value: before,
        }),
      },
      order: { updatedAt: 'ASC', id: 'ASC' },
      take: 25,
    });
  });

  it('rejects unbounded or invalid stale-finalization scans', async () => {
    const orm = repositoryMock();
    const repository = new TypeOrmTextVideoWorkflowRepository(orm);

    await expect(
      repository.findStaleFinalizing(new Date('invalid'), 25),
    ).rejects.toMatchObject({
      reasonCode: 'TEXT_VIDEO_WORKFLOW_MUTATION_INVALID',
    });
    await expect(
      repository.findStaleFinalizing(new Date(), 1001),
    ).rejects.toMatchObject({
      reasonCode: 'TEXT_VIDEO_WORKFLOW_MUTATION_INVALID',
    });
    expect(orm.find).not.toHaveBeenCalled();
  });

  it('rejects empty expected states and non-allowlisted mutation fields', async () => {
    const orm = repositoryMock();
    const repository = new TypeOrmTextVideoWorkflowRepository(orm);

    await expect(
      repository.compareAndSwap({
        taskId: TASK_ID,
        expectedVersion: 0,
        expectedStates: [],
        mutation: { state: 'COMPILING' },
      }),
    ).rejects.toMatchObject({
      reasonCode: 'TEXT_VIDEO_WORKFLOW_MUTATION_INVALID',
    });
    await expect(
      repository.compareAndSwap({
        taskId: TASK_ID,
        expectedVersion: 0,
        expectedStates: ['QUEUED'],
        mutation: {
          state: 'COMPILING',
          prompt: 'must not persist',
        } as unknown as { state: 'COMPILING' },
      }),
    ).rejects.toMatchObject({
      reasonCode: 'TEXT_VIDEO_WORKFLOW_MUTATION_INVALID',
    });
    expect(orm.update).not.toHaveBeenCalled();
  });
});
