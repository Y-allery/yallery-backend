import { RewardService } from './reward.service';
import { RewardTypeEnum } from './types/reward-type.enum';

/**
 * getRewardPointsOrDefault is read twice per like (LIKE_SPEND + LIKE_EARN) for
 * values an admin changes a few times a year, so it used to add two MySQL round
 * trips to the hottest write path. The cache must stay correct in the two ways
 * that matter: the caller's default still wins when no row exists, and an admin
 * edit is visible immediately.
 */
describe('RewardService reward-points cache', () => {
  const makeService = (points: number | null) => {
    const getOne = jest.fn(async () =>
      points === null ? null : ({ id: 1, points } as any),
    );
    const rewardRepository = {
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne,
      })),
      save: jest.fn(async (entity: any) => entity),
    };

    const service = new RewardService(
      rewardRepository as any,
      {
        findOne: jest.fn(),
        find: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      } as any,
      { incrementUserPoints: jest.fn() } as any,
      { emitProfileUpdate: jest.fn() } as any,
    );

    return { service, rewardRepository, getOne };
  };

  it('reads MySQL once per type, then serves from cache', async () => {
    const { service, getOne } = makeService(15);

    const first = await service.getRewardPointsOrDefault(
      RewardTypeEnum.LIKE_SPEND,
      99,
    );
    const second = await service.getRewardPointsOrDefault(
      RewardTypeEnum.LIKE_SPEND,
      99,
    );

    expect([first, second]).toEqual([15, 15]);
    expect(getOne).toHaveBeenCalledTimes(1);
  });

  it('caches a missing row too, and keeps honoring each caller default', async () => {
    const { service, getOne } = makeService(null);

    const first = await service.getRewardPointsOrDefault(
      RewardTypeEnum.LIKE_EARN,
      5,
    );
    const second = await service.getRewardPointsOrDefault(
      RewardTypeEnum.LIKE_EARN,
      7,
    );

    expect([first, second]).toEqual([5, 7]);
    expect(getOne).toHaveBeenCalledTimes(1);
  });

  it('caches per reward type, not globally', async () => {
    const { service, getOne } = makeService(15);

    await service.getRewardPointsOrDefault(RewardTypeEnum.LIKE_SPEND, 99);
    await service.getRewardPointsOrDefault(RewardTypeEnum.LIKE_EARN, 99);

    expect(getOne).toHaveBeenCalledTimes(2);
  });

  it('re-reads after the TTL expires', async () => {
    const { service, getOne } = makeService(15);

    await service.getRewardPointsOrDefault(RewardTypeEnum.LIKE_SPEND, 99);
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 61000);
    await service.getRewardPointsOrDefault(RewardTypeEnum.LIKE_SPEND, 99);
    nowSpy.mockRestore();

    expect(getOne).toHaveBeenCalledTimes(2);
  });

  it('drops the cached amount when an admin updates the reward', async () => {
    const { service, getOne } = makeService(15);

    await service.getRewardPointsOrDefault(RewardTypeEnum.LIKE_SPEND, 99);
    await service.updateReward(RewardTypeEnum.LIKE_SPEND, {
      points: 20,
    } as any);
    await service.getRewardPointsOrDefault(RewardTypeEnum.LIKE_SPEND, 99);

    // One read before the update, the update's own read, one read after.
    expect(getOne).toHaveBeenCalledTimes(3);
  });
});
