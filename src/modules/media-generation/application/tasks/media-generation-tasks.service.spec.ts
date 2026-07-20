import { MediaGenerationTasksService } from './media-generation-tasks.service';

/**
 * The client uses this to rebuild its UI after missing websocket events, so
 * the three outcomes must stay strictly separated: a still-running generation
 * keeps its spinner, a dead one becomes an error, and a successful one must
 * NOT appear (its result arrives over the socket / undelivered channel).
 */
describe('MediaGenerationTasksService.getUnfinishedTasks', () => {
  const charge = (over: Partial<any> = {}) => ({
    jobId: 'job-1',
    userId: 7,
    status: 'reserved',
    aiService: 'qwen_image',
    createdAt: new Date('2026-07-20T12:00:00Z'),
    ...over,
  });

  const createService = ({ charges = [], jobs = {} }: any = {}) => {
    const chargeRepository = {
      find: jest.fn(async (_options: any) => charges),
    };
    // One queue holds the jobs; the rest answer "not mine".
    const holder = {
      name: 'media_prompt_image_generation',
      getJob: jest.fn(async (id: string) =>
        jobs[id] ? { getState: async () => jobs[id] } : null,
      ),
    };
    const empty = () => ({ name: 'other', getJob: jest.fn(async () => null) });

    const service = new MediaGenerationTasksService(
      chargeRepository as any,
      holder as any,
      empty() as any,
      empty() as any,
      empty() as any,
      empty() as any,
      empty() as any,
    );
    return { service, chargeRepository, holder };
  };

  it('reports a refunded charge as failed without touching the queues', async () => {
    const { service, holder } = createService({
      charges: [charge({ status: 'refunded', jobId: 'dead-1' })],
    });

    const tasks = await service.getUnfinishedTasks(7);

    expect(tasks).toEqual([
      expect.objectContaining({ taskId: 'dead-1', status: 'failed' }),
    ]);
    // The refund already proves the job gave up.
    expect(holder.getJob).not.toHaveBeenCalled();
  });

  it('omits a succeeded generation: removeOnComplete deleted its job', async () => {
    const { service } = createService({
      charges: [charge({ jobId: 'done-1' })],
      jobs: {},
    });

    await expect(service.getUnfinishedTasks(7)).resolves.toEqual([]);
  });

  it('keeps a running generation as processing', async () => {
    const { service } = createService({
      charges: [charge({ jobId: 'live-1' })],
      jobs: { 'live-1': 'active' },
    });

    const tasks = await service.getUnfinishedTasks(7);

    expect(tasks).toEqual([
      expect.objectContaining({ taskId: 'live-1', status: 'processing' }),
    ]);
  });

  it('treats a queued (not yet started) generation as processing too', async () => {
    const { service } = createService({
      charges: [charge({ jobId: 'wait-1' })],
      jobs: { 'wait-1': 'waiting' },
    });

    const tasks = await service.getUnfinishedTasks(7);
    expect(tasks[0]).toMatchObject({ status: 'processing' });
  });

  it('reports a failed job even before its refund lands', async () => {
    const { service } = createService({
      charges: [charge({ jobId: 'fail-1', status: 'reserved' })],
      jobs: { 'fail-1': 'failed' },
    });

    const tasks = await service.getUnfinishedTasks(7);
    expect(tasks[0]).toMatchObject({ taskId: 'fail-1', status: 'failed' });
  });

  it('does not report success when a queue lookup throws', async () => {
    const chargeRepository = {
      find: jest.fn(async () => [charge({ jobId: 'x-1' })]),
    };
    const broken = {
      name: 'broken',
      getJob: jest.fn(async () => {
        throw new Error('redis down');
      }),
    };
    const service = new MediaGenerationTasksService(
      chargeRepository as any,
      broken as any,
      broken as any,
      broken as any,
      broken as any,
      broken as any,
      broken as any,
    );

    const tasks = await service.getUnfinishedTasks(7);
    // Silently dropping it would make the client clear a live spinner.
    expect(tasks[0]).toMatchObject({ taskId: 'x-1', status: 'processing' });
  });

  it('skips charges that never got a job attached', async () => {
    const { service } = createService({
      charges: [charge({ jobId: null })],
    });

    await expect(service.getUnfinishedTasks(7)).resolves.toEqual([]);
  });

  it('scopes the query to the user and a bounded recent window', async () => {
    const { service, chargeRepository } = createService();

    await service.getUnfinishedTasks(42);

    const args = chargeRepository.find.mock.calls[0][0] as any;
    expect(args.where.userId).toBe(42);
    expect(args.where.createdAt).toBeDefined();
    expect(args.take).toBe(50);
  });
});
