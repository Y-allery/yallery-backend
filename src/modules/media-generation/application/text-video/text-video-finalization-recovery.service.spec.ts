import { createHash } from 'crypto';
import { Job } from 'bullmq';
import { MediaTextVideoJobData } from 'src/modules/media-generation/domain/contracts/media-text-video-job-data.contract';
import { MediaTextVideoWorkflowEntity } from 'src/modules/media-generation/persistence/entities/media-text-video-workflow.entity';
import { TextVideoFinalizationRecoveryService } from './text-video-finalization-recovery.service';

const NOW = new Date('2026-07-23T12:00:00.000Z');
const TASK_ID = 'task_12345678';
const CHARGE_ID = 'charge_12345678';
const PROMPT = 'A chef plates dinner in a quiet restaurant kitchen.';

function workflow(
  overrides: Partial<MediaTextVideoWorkflowEntity> = {},
): MediaTextVideoWorkflowEntity {
  return Object.assign(new MediaTextVideoWorkflowEntity(), {
    id: 1,
    taskId: TASK_ID,
    userId: 42,
    chargeId: CHARGE_ID,
    contestSubmissionId: 77,
    pipelineMode: 'cascade',
    rawPromptSha256: createHash('sha256').update(PROMPT, 'utf8').digest('hex'),
    state: 'FINALIZING',
    version: 17,
    finalizingAt: new Date('2026-07-23T11:00:00.000Z'),
    finalPostId: null,
    refundStatus: 'none',
    updatedAt: new Date('2026-07-23T11:00:00.000Z'),
    ...overrides,
  });
}

function jobData(
  overrides: Partial<MediaTextVideoJobData> = {},
): MediaTextVideoJobData {
  return {
    request: {
      aiService: 'ltx_video',
      prompt: PROMPT,
      orientation: 'horizontal',
      duration: 5,
      contestId: 3,
      contestSubmissionId: 77,
    },
    userId: 42,
    aiService: 'ltx_video',
    chargeId: CHARGE_ID,
    ltxTextPipelineMode: 'cascade',
    ...overrides,
  };
}

function job(
  state: string = 'failed',
  data: MediaTextVideoJobData = jobData(),
) {
  let currentState = state;
  const retry = jest.fn(async () => {
    currentState = 'waiting';
  });
  return {
    id: TASK_ID,
    data,
    getState: jest.fn(async () => currentState),
    retry,
  } as unknown as jest.Mocked<Job<MediaTextVideoJobData>>;
}

function harness(params?: {
  candidate?: MediaTextVideoWorkflowEntity;
  fresh?: MediaTextVideoWorkflowEntity | null;
  retainedJob?: jest.Mocked<Job<MediaTextVideoJobData>> | null;
}) {
  const candidate = params?.candidate ?? workflow();
  const fresh = params?.fresh === undefined ? candidate : params.fresh;
  const retainedJob =
    params?.retainedJob === undefined ? job() : params.retainedJob;
  const repository = {
    findStaleFinalizing: jest.fn(async () => [candidate]),
    findByTaskId: jest.fn(async () => fresh),
  };
  const queue = {
    getJob: jest.fn(async () => retainedJob),
    add: jest.fn(),
  };
  const service = new TextVideoFinalizationRecoveryService(
    repository as any,
    queue as any,
  );
  return { service, repository, queue, retainedJob };
}

describe('TextVideoFinalizationRecoveryService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is registered as a bounded ten-minute scheduler', () => {
    expect(
      Reflect.getMetadata(
        'SCHEDULE_CRON_OPTIONS',
        TextVideoFinalizationRecoveryService.prototype
          .recoverStaleFinalizations,
      ),
    ).toEqual({ cronTime: '0 */10 * * * *' });
  });

  it('autonomously retries only the original retained failed job', async () => {
    const h = harness();

    await h.service.recoverStaleFinalizations();

    expect(h.repository.findStaleFinalizing).toHaveBeenCalledWith(
      new Date('2026-07-23T11:45:00.000Z'),
      25,
    );
    expect(h.queue.getJob).toHaveBeenCalledWith(TASK_ID);
    expect(h.retainedJob!.retry).toHaveBeenCalledWith('failed');
    expect(h.queue.add).not.toHaveBeenCalled();
  });

  it.each(['active', 'waiting', 'delayed'])(
    'does not disturb a retained job in %s state',
    async (state) => {
      const retainedJob = job(state);
      const h = harness({ retainedJob });

      await h.service.recoverStaleFinalizations();

      expect(retainedJob.retry).not.toHaveBeenCalled();
      expect(h.queue.add).not.toHaveBeenCalled();
    },
  );

  it('fails closed when the retained job is missing and never synthesizes one', async () => {
    const h = harness({ retainedJob: null });

    await h.service.recoverStaleFinalizations();

    expect(h.queue.getJob).toHaveBeenCalledWith(TASK_ID);
    expect(h.queue.add).not.toHaveBeenCalled();
  });

  it.each([
    ['pipeline mode', jobData({ ltxTextPipelineMode: 'native' })],
    ['user', jobData({ userId: 41 })],
    ['charge', jobData({ chargeId: 'charge_other_12345678' })],
    [
      'contest submission',
      jobData({
        request: {
          ...jobData().request,
          contestSubmissionId: 78,
        },
      }),
    ],
    [
      'prompt hash',
      jobData({
        request: {
          ...jobData().request,
          prompt: 'A different prompt that must not be recovered.',
        },
      }),
    ],
  ])('fails closed on a mismatched %s', async (_label, data) => {
    const retainedJob = job('failed', data);
    const h = harness({ retainedJob });

    await h.service.recoverStaleFinalizations();

    expect(retainedJob.getState).not.toHaveBeenCalled();
    expect(retainedJob.retry).not.toHaveBeenCalled();
    expect(h.queue.add).not.toHaveBeenCalled();
  });

  it('re-reads durable state and refuses a row completed during recovery', async () => {
    const candidate = workflow();
    const completed = workflow({
      state: 'COMPLETED',
      finalPostId: 321,
      completedAt: new Date('2026-07-23T12:00:00.000Z'),
    });
    const retainedJob = job();
    const repository = {
      findStaleFinalizing: jest.fn(async () => [candidate]),
      findByTaskId: jest
        .fn()
        .mockResolvedValueOnce(candidate)
        .mockResolvedValueOnce(completed),
    };
    const queue = {
      getJob: jest.fn(async () => retainedJob),
      add: jest.fn(),
    };
    const service = new TextVideoFinalizationRecoveryService(
      repository as any,
      queue as any,
    );

    await service.recoverStaleFinalizations();

    expect(retainedJob.retry).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('allows exactly one winner when two instances race for the atomic retry lease', async () => {
    let currentState = 'failed';
    let initialReads = 0;
    let releaseInitialReads!: () => void;
    const bothObservedFailed = new Promise<void>((resolve) => {
      releaseInitialReads = resolve;
    });
    const retainedJob = {
      id: TASK_ID,
      data: jobData(),
      getState: jest.fn(async () => {
        if (initialReads < 2) {
          initialReads += 1;
          const observed = currentState;
          if (initialReads === 2) {
            releaseInitialReads();
          }
          await bothObservedFailed;
          return observed;
        }
        return currentState;
      }),
      retry: jest.fn(async () => {
        if (currentState !== 'failed') {
          throw new Error('JOB_NOT_IN_FAILED_STATE');
        }
        currentState = 'waiting';
      }),
    } as unknown as jest.Mocked<Job<MediaTextVideoJobData>>;
    const sharedRepository = {
      findStaleFinalizing: jest.fn(async () => [workflow()]),
      findByTaskId: jest.fn(async () => workflow()),
    };
    const sharedQueue = {
      getJob: jest.fn(async () => retainedJob),
      add: jest.fn(),
    };
    const first = new TextVideoFinalizationRecoveryService(
      sharedRepository as any,
      sharedQueue as any,
    );
    const second = new TextVideoFinalizationRecoveryService(
      sharedRepository as any,
      sharedQueue as any,
    );

    await expect(
      Promise.all([
        first.recoverStaleFinalizations(),
        second.recoverStaleFinalizations(),
      ]),
    ).resolves.toEqual([undefined, undefined]);

    expect(retainedJob.retry).toHaveBeenCalledTimes(2);
    expect(currentState).toBe('waiting');
    expect(retainedJob.getState).toHaveBeenCalledTimes(3);
    expect(sharedQueue.add).not.toHaveBeenCalled();
  });

  it('does not retry a malformed or not-yet-stale FINALIZING row', async () => {
    const retainedJob = job();
    const h = harness({
      candidate: workflow({
        finalizingAt: new Date('2026-07-23T11:50:00.000Z'),
      }),
      retainedJob,
    });

    await h.service.recoverStaleFinalizations();

    expect(h.queue.getJob).not.toHaveBeenCalled();
    expect(retainedJob.retry).not.toHaveBeenCalled();
  });
});
