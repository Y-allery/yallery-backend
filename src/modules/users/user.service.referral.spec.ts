import { BadRequestException } from '@nestjs/common';
import { UserService } from 'src/modules/users/user.service';
import { ReferralRedemptionEntity } from 'src/modules/users/entities/referral-redemption.entity';
import {
  REFERRAL_ERROR_CODES,
  REFERRAL_REWARD_STATES,
} from 'src/modules/users/referral/referral-reward.contract';

/**
 * A code is a durable invite: the same link goes into a group chat or a story and every
 * reader may redeem it. What must stay single-use is the invited user's own bonus, and
 * that is now claimed by the unique insert into referral_redemptions rather than by
 * stamping usedById onto the code.
 *
 * Also covers the abuse policy layered on top: the referrer is credited only within
 * their daily/lifetime cap, and only once the invited user has actually generated media.
 */
describe('UserService.useReferralCode', () => {
  const createService = ({
    referral = { id: 5, user: { id: 99, points: 0 } },
    user = { id: 7, bonusEligible: true, points: 0 },
    redemptionInserted = 1,
    bonusClaimAffected = 1,
    lifetimeCount = 0,
    dailyCount = 0,
    dailyCap = 10,
    lifetimeCap = 50,
    refereeHasGenerated = true,
  }: any = {}) => {
    const increment = jest.fn(async () => ({ affected: 1 }));

    const updateQb = (affected: number) => ({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => ({ affected })),
    });

    const insertQb = (affectedRows: number) => ({
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => ({ raw: { affectedRows } })),
    });

    const userManagerRepo = {
      createQueryBuilder: jest.fn(() => updateQb(bonusClaimAffected)),
      increment,
    };
    const redemptionManagerRepo = {
      createQueryBuilder: jest.fn(() => insertQb(redemptionInserted)),
    };

    const manager = {
      getRepository: jest.fn((entity: any) =>
        entity === ReferralRedemptionEntity
          ? redemptionManagerRepo
          : userManagerRepo,
      ),
    };
    const activityExist = jest.fn(async () => refereeHasGenerated);
    const dataSource = {
      transaction: jest.fn(async (cb: any) => cb(manager)),
      getRepository: jest.fn(() => ({ exist: activityExist })),
    };

    const userModel = { findOne: jest.fn(async () => user) };
    const capsQb = {
      innerJoin: jest.fn().mockReturnThis(),
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
    const referralRepository = { findOne: jest.fn(async () => referral) };
    const referralRedemptionRepository = {
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
      referralRedemptionRepository as any, // 12 referralRedemptionRepository
      {} as any, // 13 partnerShipRepository
      {} as any, // 14 partnerShipActivityRepository
      {} as any, // 15 partnerUserLinkRepository
      {} as any, // 16 reportPostRepository
      {} as any, // 17 paymentRepository
      dataSource as any, // 18 dataSource
      providerRuntimeConfigService as any, // 19 providerRuntimeConfigService
    );

    return {
      service,
      increment,
      dataSource,
      referralRepository,
      claimBuilder: redemptionManagerRepo.createQueryBuilder,
      notificationGateway,
      activityExist,
      providerRuntimeConfigService,
    };
  };

  /** The row the claiming INSERT wrote into referral_redemptions. */
  const redeemedRow = (claimBuilder: jest.Mock) =>
    claimBuilder.mock.results[0].value.values.mock.calls[0][0];

  it('credits both users once when the redemption and bonus are claimed', async () => {
    const { service, increment } = createService();

    await service.useReferralCode(7, 'CODE');

    expect(increment).toHaveBeenCalledTimes(2);
    expect(increment).toHaveBeenCalledWith({ id: 7 }, 'points', 500); // referee
    expect(increment).toHaveBeenCalledWith({ id: 99 }, 'points', 500); // referrer
  });

  // The point of the whole change: one shared link, many redeemers.
  it('lets a second person redeem a code someone else already used', async () => {
    const { service, increment, claimBuilder } = createService();

    await service.useReferralCode(7, 'CODE');

    expect(increment).toHaveBeenCalledTimes(2);
    expect(redeemedRow(claimBuilder)).toMatchObject({
      referralId: 5,
      redeemedById: 7,
    });
  });

  it('aborts without crediting when this user already redeemed something', async () => {
    const { service, increment } = createService({ redemptionInserted: 0 });

    await expect(service.useReferralCode(7, 'CODE')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(increment).not.toHaveBeenCalled();
  });

  it('aborts without crediting when the one-time bonus was already consumed', async () => {
    const { service, increment } = createService({ bonusClaimAffected: 0 });

    await expect(service.useReferralCode(7, 'CODE')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(increment).not.toHaveBeenCalled();
  });

  it('rejects using your own referral code', async () => {
    const { service, dataSource } = createService({
      referral: { id: 5, user: { id: 7 } }, // owner === caller
    });

    await expect(service.useReferralCode(7, 'CODE')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  // The app used to branch on the message text, so the code has to be in the body.
  it('carries a machine-readable code on every refusal', async () => {
    const own = createService({ referral: { id: 5, user: { id: 7 } } });
    await expect(own.service.useReferralCode(7, 'CODE')).rejects.toMatchObject({
      response: { code: REFERRAL_ERROR_CODES.OWN_CODE },
    });

    const spent = createService({
      user: { id: 7, bonusEligible: false },
    });
    await expect(
      spent.service.useReferralCode(7, 'CODE'),
    ).rejects.toMatchObject({
      response: { code: REFERRAL_ERROR_CODES.BONUS_ALREADY_USED },
    });

    const missing = createService();
    missing.referralRepository.findOne.mockResolvedValue(null);
    await expect(
      missing.service.useReferralCode(7, 'CODE'),
    ).rejects.toMatchObject({
      response: { code: REFERRAL_ERROR_CODES.NOT_FOUND },
    });
  });

  it('rejects a second account on the same mailbox (alias loop)', async () => {
    const { service, dataSource } = createService({
      referral: { id: 5, user: { id: 99, email: 'Farm.Er@gmail.com' } },
      user: { id: 7, bonusEligible: true, email: 'farmer+2@googlemail.com' },
    });

    await expect(service.useReferralCode(7, 'CODE')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('still credits when two different mailboxes only look similar', async () => {
    const { service, increment } = createService({
      referral: { id: 5, user: { id: 99, email: 'farmer@outlook.com' } },
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
    expect(redeemedRow(claimBuilder)).toMatchObject({
      rewardState: REFERRAL_REWARD_STATES.PENDING,
      rewardedAt: null,
    });
    expect(notificationGateway.emitProfileUpdate).toHaveBeenCalledTimes(1);
  });

  it('marks the redemption capped and skips the referrer at the daily cap', async () => {
    const { service, increment, claimBuilder, activityExist } = createService({
      dailyCount: 10,
      dailyCap: 10,
    });

    await service.useReferralCode(7, 'CODE');

    expect(increment).toHaveBeenCalledTimes(1);
    expect(increment).toHaveBeenCalledWith({ id: 7 }, 'points', 500);
    expect(redeemedRow(claimBuilder)).toMatchObject({
      rewardState: REFERRAL_REWARD_STATES.CAPPED,
    });
    // Being capped short-circuits the generation lookup.
    expect(activityExist).not.toHaveBeenCalled();
  });

  it('marks the redemption capped at the lifetime cap', async () => {
    const { service, increment, claimBuilder } = createService({
      lifetimeCount: 50,
      lifetimeCap: 50,
    });

    await service.useReferralCode(7, 'CODE');

    expect(increment).toHaveBeenCalledTimes(1);
    expect(redeemedRow(claimBuilder)).toMatchObject({
      rewardState: REFERRAL_REWARD_STATES.CAPPED,
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
    expect(redeemedRow(claimBuilder)).toMatchObject({
      rewardState: REFERRAL_REWARD_STATES.PAID,
    });
  });
});
