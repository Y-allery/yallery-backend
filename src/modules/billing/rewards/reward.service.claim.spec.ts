import { RewardService } from './reward.service';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { RewardTypeEnum } from './types/reward-type.enum';

/**
 * Regression tests for the claimReward TOCTOU. claimedDate was read, then
 * points incremented, then claimedDate written — with no transaction/lock — so
 * two parallel claims for the same reward both observed claimedDate=null and
 * both credited. The claim must now be a single atomic conditional UPDATE.
 */
describe('RewardService.claimReward (double-award TOCTOU)', () => {
  const createService = ({
    userReward = { id: 3, userId: 7, claimedDate: null },
    claimAffected = 1,
    points = 50,
  }: any = {}) => {
    const increment = jest.fn(async () => ({ affected: 1 }));
    const claimQb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => ({ affected: claimAffected })),
    };
    const manager = {
      getRepository: jest.fn((entity: any) =>
        entity === UserEntity
          ? { increment }
          : { createQueryBuilder: () => claimQb },
      ),
    };
    const userRewardRepository = {
      findOne: jest.fn(async () => userReward),
      manager: { transaction: jest.fn(async (cb: any) => cb(manager)) },
    };
    const notificationGateway = {
      emitProfileUpdate: jest.fn(async () => undefined),
    };

    const service = new RewardService(
      {} as any, // rewardRepository
      userRewardRepository as any,
      { incrementUserPoints: jest.fn() } as any, // userService
      notificationGateway as any,
    );
    jest.spyOn(service, 'getRewardPoints').mockResolvedValue(points);

    return { service, increment, notificationGateway, userRewardRepository };
  };

  it('awards points once when the claim wins the conditional update', async () => {
    const { service, increment, notificationGateway } = createService({
      claimAffected: 1,
      points: 50,
    });

    const result = await service.claimReward(7, RewardTypeEnum.DAILY_LOGIN);

    expect(result.success).toBe(true);
    expect(result.pointsAwarded).toBe(50);
    expect(increment).toHaveBeenCalledWith({ id: 7 }, 'points', 50);
    expect(notificationGateway.emitProfileUpdate).toHaveBeenCalledWith('7');
  });

  it('does NOT award again when a concurrent claim already flipped claimedDate', async () => {
    const { service, increment, notificationGateway } = createService({
      claimAffected: 0, // conditional UPDATE matched nothing
    });

    const result = await service.claimReward(7, RewardTypeEnum.DAILY_LOGIN);

    expect(result.success).toBe(false);
    expect(result.pointsAwarded).toBe(0);
    expect(increment).not.toHaveBeenCalled();
    expect(notificationGateway.emitProfileUpdate).not.toHaveBeenCalled();
  });

  it('returns not-available when there is no reward row', async () => {
    const { service, userRewardRepository } = createService({ userReward: null });

    const result = await service.claimReward(7, RewardTypeEnum.DAILY_LOGIN);

    expect(result.success).toBe(false);
    expect(userRewardRepository.manager.transaction).not.toHaveBeenCalled();
  });

  it('fast-fails when the reward was already claimed (pre-read guard)', async () => {
    const { service, increment } = createService({
      userReward: { id: 3, userId: 7, claimedDate: new Date() },
    });

    const result = await service.claimReward(7, RewardTypeEnum.DAILY_LOGIN);

    expect(result.success).toBe(false);
    expect(increment).not.toHaveBeenCalled();
  });
});
