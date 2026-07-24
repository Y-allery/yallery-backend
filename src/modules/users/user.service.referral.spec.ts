import { BadRequestException } from '@nestjs/common';
import { UserService } from 'src/modules/users/user.service';
import { ReferralEntity } from 'src/modules/users/entities/user-refferals.entity';
import { REFERRAL_REWARD_STATES } from 'src/modules/users/referral/referral-reward.contract';

/**
 * Regression tests for the useReferralCode race. The usedBy / bonusEligible
 * checks ran outside any transaction and credited both users with full-entity
 * saves, so two concurrent uses of the same code double-credited the referrer
 * and clobbered concurrent point changes. The claim must now be atomic.
 *
 * Also covers the abuse policy layered on top: the referrer is credited only
 * within their daily/lifetime cap, and only once the invited user has actually
 * generated media.
 */
describe('UserService.useReferralCode (double referral bonus)', () => {
  const createService = ({
    referral = { id: 5, user: { id: 99, points: 0 }, usedBy: null },
    user = { id: 7, bonusEligible: true, points: 0 },
    codeClaimAffected = 1,
    bonusClaimAffected = 1,
    lifetimeCount = 0,
    dailyCount = 0,
    dailyCap = 10,
    lifetimeCap = 50,
    refereeHasGenerated = true,
  }: any = {}) => {
    const increment = jest.fn(async () => ({ affected: 1 }));

    const makeQb = (affected: number) => ({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => ({ affected })),
    });

    const userManagerRepo = {
      createQueryBuilder: jest.fn(() => makeQb(bonusClaimAffected)),
      increment,
    };
    const referralManagerRepo = {
      createQueryBuilder: jest.fn(() => makeQb(codeClaimAffected)),
    };

    const manager = {
      getRepository: jest.fn((entity: any) =>
        entity === ReferralEntity ? referralManagerRepo : userManagerRepo,
      ),
    };
    const activityExist = jest.fn(async () => refereeHasGenerated);
    const dataSource = {
      transaction: jest.fn(async (cb: any) => cb(manager)),
      getRepository: jest.fn(() => ({ exist: activityExist })),
    };

    const userModel = { findOne: jest.fn(async () => user) };
    const capsQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(async () => ({
        lifetimeCount: String(lifetimeCount),
        dailyCount: String(dailyCount),
      })),
    };
    const referralRepository = {
      findOne: jest.fn(async () => referral),
      createQueryBuilder: jest.fn(() => capsQb),
    };
    const rewardService = {
      getRewardPointsOrDefault: jest.fn(async () => 500),
    };
    const notificationGateway = {
      emitProfileUpdate: jest.fn(async () => undefined),
    };
    const providerRuntimeConfigService = {
      getNumber: jest.fn(async (key: string) =>
        key.includes('DAILY') ? dailyCap : lifetimeCap,
      ),
    };

    const service = new UserService(
      userModel as any, // 1 userModel
      {} as any, // 2 likeModel
      {} as any, // 3 tagModel
      {} as any, // 4 postModel
      {} as any, // 5 deviceTokenModel
      {} as any, // 6 userActivityQueryService
      rewardService as any, // 7 rewardService
      notificationGateway as any, // 8 notificationGateway
      {} as any, // 9 firebaseService
      {} as any, // 10 uploadService
      referralRepository as any, // 11 referralRepository
      {} as any, // 12 partnerShipRepository
      {} as any, // 13 partnerShipActivityRepository
      {} as any, // 14 partnerUserLinkRepository
      {} as any, // 15 reportPostRepository
      {} as any, // 16 paymentRepository
      dataSource as any, // 17 dataSource
      providerRuntimeConfigService as any, // 18 providerRuntimeConfigService
    );

    return {
      service,
      increment,
      dataSource,
      claimBuilder: referralManagerRepo.createQueryBuilder,
      notificationGateway,
      activityExist,
      providerRuntimeConfigService,
    };
  };

  /** What the claiming UPDATE wrote on the referral row. */
  const claimedState = (claimBuilder: jest.Mock) =>
    claimBuilder.mock.results[0].value.set.mock.calls[0][0];

  it('credits both users once when the code and bonus are successfully claimed', async () => {
    const { service, increment } = createService();

    await service.useReferralCode(7, 'CODE');

    expect(increment).toHaveBeenCalledTimes(2);
    expect(increment).toHaveBeenCalledWith({ id: 7 }, 'points', 500); // referee
    expect(increment).toHaveBeenCalledWith({ id: 99 }, 'points', 500); // referrer
  });

  it('aborts without crediting when the code was already claimed (race lost)', async () => {
    const { service, increment } = createService({ codeClaimAffected: 0 });

    await expect(service.useReferralCode(7, 'CODE')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(increment).not.toHaveBeenCalled();
  });

  it('aborts without crediting when the user already consumed their one-time bonus (race lost)', async () => {
    const { service, increment } = createService({ bonusClaimAffected: 0 });

    await expect(service.useReferralCode(7, 'CODE')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(increment).not.toHaveBeenCalled();
  });

  it('rejects a code already used (fast-fail, before the transaction)', async () => {
    const { service, dataSource } = createService({
      referral: { id: 5, user: { id: 99 }, usedBy: { id: 123 } },
    });

    await expect(service.useReferralCode(7, 'CODE')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects using your own referral code', async () => {
    const { service, dataSource } = createService({
      referral: { id: 5, user: { id: 7 }, usedBy: null }, // owner === caller
    });

    await expect(service.useReferralCode(7, 'CODE')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects a second account on the same mailbox (alias loop)', async () => {
    const { service, dataSource } = createService({
      referral: {
        id: 5,
        user: { id: 99, email: 'Farm.Er@gmail.com' },
        usedBy: null,
      },
      user: { id: 7, bonusEligible: true, email: 'farmer+2@googlemail.com' },
    });

    await expect(service.useReferralCode(7, 'CODE')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('still credits when two different mailboxes only look similar', async () => {
    const { service, increment } = createService({
      referral: {
        id: 5,
        user: { id: 99, email: 'farmer@outlook.com' },
        usedBy: null,
      },
      user: { id: 7, bonusEligible: true, email: 'far.mer@outlook.com' },
    });

    await service.useReferralCode(7, 'CODE');

    expect(increment).toHaveBeenCalledTimes(2);
  });

  it('defers the referrer reward until the invited user has generated media', async () => {
    const { service, increment, claimBuilder, notificationGateway } =
      createService({ refereeHasGenerated: false });

    await service.useReferralCode(7, 'CODE');

    // The invited user keeps their own bonus; the referrer waits for the sweep.
    expect(increment).toHaveBeenCalledTimes(1);
    expect(increment).toHaveBeenCalledWith({ id: 7 }, 'points', 500);
    expect(claimedState(claimBuilder)).toMatchObject({
      referrerRewardState: REFERRAL_REWARD_STATES.PENDING,
      referrerRewardedAt: null,
    });
    expect(notificationGateway.emitProfileUpdate).toHaveBeenCalledTimes(1);
  });

  it('marks the referral capped and skips the referrer when the daily cap is reached', async () => {
    const { service, increment, claimBuilder, activityExist } = createService({
      dailyCount: 10,
      dailyCap: 10,
    });

    await service.useReferralCode(7, 'CODE');

    expect(increment).toHaveBeenCalledTimes(1);
    expect(increment).toHaveBeenCalledWith({ id: 7 }, 'points', 500);
    expect(claimedState(claimBuilder)).toMatchObject({
      referrerRewardState: REFERRAL_REWARD_STATES.CAPPED,
    });
    // Being capped short-circuits the generation lookup.
    expect(activityExist).not.toHaveBeenCalled();
  });

  it('marks the referral capped when the lifetime cap is reached', async () => {
    const { service, increment, claimBuilder } = createService({
      lifetimeCount: 50,
      lifetimeCap: 50,
    });

    await service.useReferralCode(7, 'CODE');

    expect(increment).toHaveBeenCalledTimes(1);
    expect(claimedState(claimBuilder)).toMatchObject({
      referrerRewardState: REFERRAL_REWARD_STATES.CAPPED,
    });
  });

  it('falls back to the default caps when the runtime settings read fails', async () => {
    const { service, increment, claimBuilder, providerRuntimeConfigService } =
      createService({ dailyCount: 3, lifetimeCount: 4 });
    providerRuntimeConfigService.getNumber.mockRejectedValue(
      new Error('settings unavailable'),
    );

    await service.useReferralCode(7, 'CODE');

    expect(increment).toHaveBeenCalledTimes(2);
    expect(claimedState(claimBuilder)).toMatchObject({
      referrerRewardState: REFERRAL_REWARD_STATES.PAID,
    });
  });
});
