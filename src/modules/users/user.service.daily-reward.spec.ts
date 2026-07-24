import { UserService } from 'src/modules/users/user.service';

/**
 * Regression tests for handleDailyReward:
 *  - the lost-update: the cron read each user's points then wrote
 *    `points = snapshot + reward` (absolute SET), so any concurrent points
 *    change was clobbered. It must use an atomic increment.
 *  - the unbounded fan-out: it loaded the whole cohort into one In(...) and
 *    fired every push in a single Promise.all, which at 50k users saturates the
 *    connection pool and the event loop in one tick.
 */
describe('UserService.handleDailyReward', () => {
  beforeEach(() => {
    // The pacing sleeps are real; run them instantly so the multi-page case
    // does not spend seconds of wall clock in the test.
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn();
      return 0;
    }) as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createService = ({ eligible = [{ id: 1 }, { id: 2 }] }: any = {}) => {
    // The cron pages by keyset, so the mock has to honour `user.id > :lastId`
    // and the page size instead of replaying the whole cohort every call.
    let lastId = 0;
    let takeSize = Number.MAX_SAFE_INTEGER;
    const creditedPages: number[][] = [];

    const selectQb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn((_condition: string, params: any = {}) => {
        if (typeof params?.lastId === 'number') {
          lastId = params.lastId;
        }
        return selectQb;
      }),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn((size: number) => {
        takeSize = size;
        return selectQb;
      }),
      getMany: jest.fn(async () =>
        eligible.filter((user: any) => user.id > lastId).slice(0, takeSize),
      ),
    };
    const increment = jest.fn(async (criteria: any) => {
      creditedPages.push(criteria?.id?.value ?? []);
      return { affected: eligible.length };
    });
    const userModel = {
      createQueryBuilder: jest.fn(() => selectQb),
      increment,
    };
    const rewardService = { getRewardPointsOrDefault: jest.fn(async () => 10) };

    const service = new UserService(
      userModel as any, // 1 userModel
      {} as any, // 2
      {} as any, // 3
      {} as any, // 4
      {} as any, // 5
      {} as any, // 6
      rewardService as any, // 7 rewardService
      {} as any, // 8
      {} as any, // 9
      {} as any, // 10
      {} as any, // 11
      {} as any, // 12
      {} as any, // 13
      {} as any, // 14
      {} as any, // 15
      {} as any, // 16
      {} as any, // 17
      { getNumber: jest.fn(async () => null) } as any, // 18 providerRuntimeConfigService
    );
    const sendPush = jest
      .spyOn(service, 'sendPushNotificationIfEnabled')
      .mockResolvedValue(undefined as any);

    return { service, increment, sendPush, creditedPages };
  };

  it('credits eligible users via a single atomic increment, not a stale absolute set', async () => {
    const { service, increment } = createService({
      eligible: [{ id: 1 }, { id: 2 }],
    });

    await service.handleDailyReward();

    expect(increment).toHaveBeenCalledTimes(1);
    expect(increment).toHaveBeenCalledWith(expect.anything(), 'points', 10);
  });

  it('does nothing when no users are eligible', async () => {
    const { service, increment } = createService({ eligible: [] });

    await service.handleDailyReward();

    expect(increment).not.toHaveBeenCalled();
  });

  it('pushes every eligible user exactly once', async () => {
    const eligible = Array.from({ length: 37 }, (_, i) => ({ id: i + 1 }));
    const { service, sendPush } = createService({ eligible });

    await service.handleDailyReward();

    expect(sendPush).toHaveBeenCalledTimes(37);
    const notified = sendPush.mock.calls.map(([id]) => id);
    expect(new Set(notified).size).toBe(37);
  });

  it('pages forward without revisiting ids when the cohort exceeds one page', async () => {
    // The increment bumps updatedAt, so rewarded rows stay inside the
    // eligibility window — only the forward id cursor stops a second reward.
    const eligible = Array.from({ length: 1100 }, (_, i) => ({ id: i + 1 }));
    const { service, increment, creditedPages, sendPush } = createService({
      eligible,
    });

    await service.handleDailyReward();

    expect(increment.mock.calls.length).toBeGreaterThan(1);
    const credited = creditedPages.flat();
    expect(credited).toHaveLength(1100);
    expect(new Set(credited).size).toBe(1100);
    expect(sendPush).toHaveBeenCalledTimes(1100);
  });

  it('keeps notifying the remaining users when one push throws', async () => {
    const { service, sendPush } = createService({
      eligible: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    sendPush.mockImplementation(async (id: number) => {
      if (id === 2) {
        throw new Error('user vanished');
      }
      return undefined as any;
    });

    await expect(service.handleDailyReward()).resolves.toBeUndefined();

    expect(sendPush).toHaveBeenCalledTimes(3);
  });
});
