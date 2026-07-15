import { ContestService } from './contest.service';
import { ContestStatusEnum } from './types/contest.status.enum';

const HOUR = 60 * 60 * 1000;

const createService = (contest: any) => {
  const saved: any[] = [];
  const contestRepository = {
    find: jest.fn(async () => [contest]),
    save: jest.fn(async (value: any) => {
      saved.push(value);
      return value;
    }),
  };
  const postRepository = { count: jest.fn(async () => 0) };
  const contestFlowService = {
    advanceContestLifecycle: jest.fn(async () => ({ handled: false })),
  };
  const queueService = {
    enqueueContestStarted: jest.fn(async () => ({ jobId: 'j' })),
  };
  const notificationGateway = { emitProfileUpdate: jest.fn() };

  const service = new ContestService(
    contestRepository as any,
    {} as any,
    postRepository as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    notificationGateway as any,
    {} as any,
    contestFlowService as any,
    {} as any,
    queueService as any,
  );
  return { service, queueService };
};

describe('updateContestStatuses transitions', () => {
  it('moves a scheduled legacy CLOSED contest to UPCOMING without a push', async () => {
    const contest: any = {
      id: 1,
      name: 'Future',
      status: ContestStatusEnum.CLOSED,
      isApproved: false,
      winner: null,
      startTime: new Date(Date.now() + HOUR),
      endTime: new Date(Date.now() + 2 * HOUR),
      participants: [],
    };
    const { service, queueService } = createService(contest);

    await service.updateContestStatuses();

    expect(contest.status).toBe(ContestStatusEnum.UPCOMING);
    expect(queueService.enqueueContestStarted).not.toHaveBeenCalled();
  });

  it('opens an UPCOMING contest inside its window and enqueues the localized push', async () => {
    const contest: any = {
      id: 2,
      name: 'Live',
      status: ContestStatusEnum.UPCOMING,
      isApproved: false,
      winner: null,
      startTime: new Date(Date.now() - HOUR),
      endTime: new Date(Date.now() + HOUR),
      participants: [],
    };
    const { service, queueService } = createService(contest);

    await service.updateContestStatuses();

    expect(contest.status).toBe(ContestStatusEnum.OPEN);
    expect(queueService.enqueueContestStarted).toHaveBeenCalledWith(contest);
  });

  it('leaves finished approved contests alone', async () => {
    const contest: any = {
      id: 3,
      name: 'Done',
      status: ContestStatusEnum.CLOSED,
      isApproved: true,
      winner: { id: 9 },
      startTime: new Date(Date.now() - 3 * HOUR),
      endTime: new Date(Date.now() - HOUR),
      participants: [],
    };
    const { service, queueService } = createService(contest);

    await service.updateContestStatuses();

    expect(contest.status).toBe(ContestStatusEnum.CLOSED);
    expect(queueService.enqueueContestStarted).not.toHaveBeenCalled();
  });
});
