import { ReferralRewardSettlementService } from './referral-reward-settlement.service';
import { REFERRAL_REWARD_STATES } from './referral-reward.contract';

/**
 * The sweep pays the half of the referral bonus that redemption deliberately
 * left pending. What must hold: only referrals whose invited user generated
 * something get paid, the pending -> paid flip gates the credit so nothing is
 * paid twice, and one broken row cannot abort the run.
 */
describe('ReferralRewardSettlementService', () => {
  const createService = ({
    batches = [[]] as Array<
      Array<{ id: number; referrerId: number; refereeId: number }>
    >,
    generatedRefereeIds = [] as number[],
    claimAffected = 1,
    incrementImpl,
  }: any = {}) => {
    let batchIndex = 0;
    const pendingQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(async () => batches[batchIndex++] ?? []),
    };
    const referralRepository = {
      createQueryBuilder: jest.fn(() => pendingQb),
    };

    const activityQb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(async () =>
        generatedRefereeIds.map((userId: number) => ({ userId })),
      ),
    };

    const claimQb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => ({ affected: claimAffected })),
    };
    const increment = incrementImpl ?? jest.fn(async () => ({ affected: 1 }));
    const manager = {
      getRepository: jest.fn(() => ({
        createQueryBuilder: jest.fn(() => claimQb),
        increment,
      })),
    };

    const dataSource = {
      transaction: jest.fn(async (cb: any) => cb(manager)),
      getRepository: jest.fn(() => ({
        createQueryBuilder: jest.fn(() => activityQb),
      })),
    };

    const rewardService = {
      getRewardPointsOrDefault: jest.fn(async () => 500),
    };
    const notificationGateway = {
      emitProfileUpdate: jest.fn(async () => undefined),
    };

    const service = new ReferralRewardSettlementService(
      referralRepository as any,
      rewardService as any,
      notificationGateway as any,
      dataSource as any,
    );

    return {
      service,
      increment,
      claimQb,
      notificationGateway,
      dataSource,
      referralRepository,
    };
  };

  it('pays only the referrals whose invited user has generated media', async () => {
    const { service, increment, notificationGateway } = createService({
      batches: [
        [
          { id: 1, referrerId: 11, refereeId: 21 },
          { id: 2, referrerId: 12, refereeId: 22 },
        ],
      ],
      generatedRefereeIds: [21],
    });

    const result = await service.settlePendingRewards();

    expect(result).toEqual({ scanned: 2, settled: 1 });
    expect(increment).toHaveBeenCalledTimes(1);
    expect(increment).toHaveBeenCalledWith({ id: 11 }, 'points', 500);
    expect(notificationGateway.emitProfileUpdate).toHaveBeenCalledWith('11');
  });

  it('marks the row paid before crediting so a rerun cannot pay twice', async () => {
    const { service, claimQb } = createService({
      batches: [[{ id: 1, referrerId: 11, refereeId: 21 }]],
      generatedRefereeIds: [21],
    });

    await service.settlePendingRewards();

    expect(claimQb.set).toHaveBeenCalledWith(
      expect.objectContaining({
        referrerRewardState: REFERRAL_REWARD_STATES.PAID,
      }),
    );
    expect(claimQb.andWhere).toHaveBeenCalledWith(
      'referrerRewardState = :state',
      { state: REFERRAL_REWARD_STATES.PENDING },
    );
  });

  it('does not credit when another run already flipped the row', async () => {
    const { service, increment } = createService({
      batches: [[{ id: 1, referrerId: 11, refereeId: 21 }]],
      generatedRefereeIds: [21],
      claimAffected: 0,
    });

    const result = await service.settlePendingRewards();

    expect(result.settled).toBe(0);
    expect(increment).not.toHaveBeenCalled();
  });

  it('keeps sweeping after a row fails', async () => {
    const increment = jest
      .fn()
      .mockRejectedValueOnce(new Error('deadlock'))
      .mockResolvedValue({ affected: 1 });
    const { service } = createService({
      batches: [
        [
          { id: 1, referrerId: 11, refereeId: 21 },
          { id: 2, referrerId: 12, refereeId: 22 },
        ],
      ],
      generatedRefereeIds: [21, 22],
      incrementImpl: increment,
    });

    const result = await service.settlePendingRewards();

    expect(result).toEqual({ scanned: 2, settled: 1 });
  });

  it('stops after a short batch and rewinds the cursor for the next run', async () => {
    const { service, referralRepository } = createService({
      batches: [[{ id: 7, referrerId: 11, refereeId: 21 }]],
      generatedRefereeIds: [],
    });

    await service.settlePendingRewards();

    expect(referralRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect((service as any).cursorId).toBe(0);
  });

  it('ignores an overlapping run instead of scanning the same rows twice', async () => {
    const { service, referralRepository } = createService();
    (service as any).isRunning = true;

    const result = await service.settlePendingRewards();

    expect(result).toEqual({ scanned: 0, settled: 0 });
    expect(referralRepository.createQueryBuilder).not.toHaveBeenCalled();
  });
});
