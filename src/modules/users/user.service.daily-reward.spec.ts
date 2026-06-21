import { UserService } from 'src/modules/users/user.service';

/**
 * Regression test for the handleDailyReward lost-update. The cron read each
 * user's points then wrote `points = snapshot + reward` (absolute SET), so any
 * concurrent points change was clobbered. It must use an atomic increment.
 */
describe('UserService.handleDailyReward (lost-update)', () => {
  const createService = ({ eligible = [{ id: 1 }, { id: 2 }] }: any = {}) => {
    const selectQb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => eligible),
    };
    const increment = jest.fn(async () => ({ affected: eligible.length }));
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
    );
    jest
      .spyOn(service, 'sendPushNotificationIfEnabled')
      .mockResolvedValue(undefined as any);

    return { service, increment };
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
});
