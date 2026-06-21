import { BadRequestException } from '@nestjs/common';
import { UserService } from 'src/modules/users/user.service';
import { ReferralEntity } from 'src/modules/users/entities/user-refferals.entity';

/**
 * Regression tests for the useReferralCode race. The usedBy / bonusEligible
 * checks ran outside any transaction and credited both users with full-entity
 * saves, so two concurrent uses of the same code double-credited the referrer
 * and clobbered concurrent point changes. The claim must now be atomic.
 */
describe('UserService.useReferralCode (double referral bonus)', () => {
  const createService = ({
    referral = { id: 5, user: { id: 99, points: 0 }, usedBy: null },
    user = { id: 7, bonusEligible: true, points: 0 },
    codeClaimAffected = 1,
    bonusClaimAffected = 1,
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
    const dataSource = { transaction: jest.fn(async (cb: any) => cb(manager)) };

    const userModel = { findOne: jest.fn(async () => user) };
    const referralRepository = { findOne: jest.fn(async () => referral) };
    const rewardService = { getRewardPointsOrDefault: jest.fn(async () => 500) };
    const notificationGateway = { emitProfileUpdate: jest.fn(async () => undefined) };

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
    );

    return { service, increment, dataSource };
  };

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
});
