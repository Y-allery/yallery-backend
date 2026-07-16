import { RewardService } from './reward.service';
import { RewardTypeEnum } from './types/reward-type.enum';

/**
 * getAvailableRewards used to await ensureRegistrationRewardAutoClaimed (an
 * unconditional findOne) before three sequential SELECTs on every call. The
 * three reads now run in parallel first, and the auto-claim is skipped when
 * the one-time read already contains a registration record (same condition
 * as its own early return). When the auto-claim does create — or races — a
 * record, only the one-time read is re-fetched. The response must stay
 * identical for every state.
 */
describe('RewardService.getAvailableRewards (parallel reads + auto-claim skip)', () => {
  const today = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const registrationConfig = (points = 0) => ({
    id: 5,
    rewardType: RewardTypeEnum.REGISTRATION_REWARD,
    points,
    description: 'reg',
    isActive: true,
    isDaily: false,
  });

  const registrationRecord = (overrides: any = {}) => ({
    id: 1,
    userId: 7,
    rewardType: RewardTypeEnum.REGISTRATION_REWARD,
    eligibleDate: today(),
    claimedDate: today(),
    pointsAwarded: 0,
    ...overrides,
  });

  const createService = ({
    rewards = [],
    dailyRows = [],
    oneTimeReads = [[]],
    existingRegistration = null,
    registrationReward = null,
  }: any = {}) => {
    const qb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => rewards),
      getOne: jest.fn(async () => registrationReward),
    };
    const rewardRepository = { createQueryBuilder: jest.fn(() => qb) };

    // The daily read filters by eligibleDate; the one-time read does not.
    let oneTimeCall = 0;
    const find = jest.fn(async ({ where }: any) => {
      if ('eligibleDate' in where) {
        return dailyRows;
      }
      const result =
        oneTimeReads[Math.min(oneTimeCall, oneTimeReads.length - 1)];
      oneTimeCall += 1;
      return result;
    });

    const userRewardRepository = {
      find,
      findOne: jest.fn(async () => existingRegistration),
      create: jest.fn((data: any) => data),
      save: jest.fn(async (data: any) => data),
    };
    const userService = {
      incrementUserPoints: jest.fn(async () => undefined),
    };
    const notificationGateway = {
      emitProfileUpdate: jest.fn(async () => undefined),
    };

    const service = new RewardService(
      rewardRepository as any,
      userRewardRepository as any,
      userService as any,
      notificationGateway as any,
    );

    return {
      service,
      find,
      userRewardRepository,
      userService,
      notificationGateway,
    };
  };

  it('skips the auto-claim entirely when the one-time read already has a registration record', async () => {
    const record = registrationRecord();
    const config = registrationConfig();
    const { service, userRewardRepository, find } = createService({
      rewards: [config],
      oneTimeReads: [[record]],
    });

    const result = await service.getAvailableRewards(7);

    expect(userRewardRepository.findOne).not.toHaveBeenCalled();
    expect(userRewardRepository.save).not.toHaveBeenCalled();
    expect(find).toHaveBeenCalledTimes(2); // daily + one-time, no re-fetch
    expect(result).toEqual({
      daily: [],
      oneTime: [
        {
          rewardType: RewardTypeEnum.REGISTRATION_REWARD,
          reward: config,
          isEligible: true,
          isClaimed: true,
          eligibleDate: record.eligibleDate,
          claimedDate: record.claimedDate,
          isDaily: false,
        },
      ],
    });
  });

  it('auto-claims on first call and re-fetches only the one-time read', async () => {
    const config = registrationConfig(0);
    const created = registrationRecord();
    const {
      service,
      userRewardRepository,
      userService,
      notificationGateway,
      find,
    } = createService({
      rewards: [config],
      oneTimeReads: [[], [created]],
      registrationReward: config,
    });

    const result = await service.getAvailableRewards(7);

    expect(userRewardRepository.findOne).toHaveBeenCalledTimes(1);
    expect(userRewardRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        rewardType: RewardTypeEnum.REGISTRATION_REWARD,
        pointsAwarded: 0,
      }),
    );
    // zero-point reward: no balance change, no ws event
    expect(userService.incrementUserPoints).not.toHaveBeenCalled();
    expect(notificationGateway.emitProfileUpdate).not.toHaveBeenCalled();
    expect(find).toHaveBeenCalledTimes(3); // daily + one-time + one-time re-fetch
    expect(result.oneTime).toEqual([
      {
        rewardType: RewardTypeEnum.REGISTRATION_REWARD,
        reward: config,
        isEligible: true,
        isClaimed: true,
        eligibleDate: created.eligibleDate,
        claimedDate: created.claimedDate,
        isDaily: false,
      },
    ]);
  });

  it('credits points and emits profile update when the registration reward has points', async () => {
    const config = registrationConfig(25);
    const created = registrationRecord({ pointsAwarded: 25 });
    const { service, userService, notificationGateway } = createService({
      rewards: [config],
      oneTimeReads: [[], [created]],
      registrationReward: config,
    });

    await service.getAvailableRewards(7);

    expect(userService.incrementUserPoints).toHaveBeenCalledWith(7, 25);
    expect(notificationGateway.emitProfileUpdate).toHaveBeenCalledWith('7');
  });

  it('does not re-fetch when the registration reward config is missing/inactive', async () => {
    const { service, userRewardRepository, find } = createService({
      rewards: [],
      oneTimeReads: [[]],
      registrationReward: null,
    });

    const result = await service.getAvailableRewards(7);

    expect(userRewardRepository.findOne).toHaveBeenCalledTimes(1);
    expect(userRewardRepository.save).not.toHaveBeenCalled();
    expect(find).toHaveBeenCalledTimes(2); // nothing granted -> snapshot still valid
    expect(result).toEqual({ daily: [], oneTime: [] });
  });

  it('re-fetches when a concurrent request inserted the record after the snapshot', async () => {
    const config = registrationConfig();
    const raced = registrationRecord();
    const { service, userRewardRepository, find } = createService({
      rewards: [config],
      oneTimeReads: [[], [raced]],
      existingRegistration: raced,
    });

    const result = await service.getAvailableRewards(7);

    expect(userRewardRepository.save).not.toHaveBeenCalled();
    expect(find).toHaveBeenCalledTimes(3);
    expect(result.oneTime[0]).toEqual(
      expect.objectContaining({ isEligible: true, isClaimed: true }),
    );
  });

  it('keeps daily grouping untouched', async () => {
    const dailyConfig = {
      id: 2,
      rewardType: RewardTypeEnum.DAILY_LOGIN,
      points: 10,
      description: 'daily',
      isActive: true,
      isDaily: true,
    };
    const regRecord = registrationRecord();
    const dailyRow = {
      id: 9,
      userId: 7,
      rewardType: RewardTypeEnum.DAILY_LOGIN,
      eligibleDate: today(),
      claimedDate: null,
      pointsAwarded: null,
    };
    const { service } = createService({
      rewards: [dailyConfig, registrationConfig()],
      dailyRows: [dailyRow],
      oneTimeReads: [[regRecord]],
    });

    const result = await service.getAvailableRewards(7);

    expect(result.daily).toEqual([
      {
        rewardType: RewardTypeEnum.DAILY_LOGIN,
        reward: dailyConfig,
        isEligible: true,
        isClaimed: false,
        eligibleDate: dailyRow.eligibleDate,
        claimedDate: null,
        isDaily: true,
      },
    ]);
    expect(result.oneTime).toHaveLength(1);
  });
});
