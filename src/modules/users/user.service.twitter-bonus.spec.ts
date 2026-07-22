import { NotFoundException } from '@nestjs/common';
import { UserService } from 'src/modules/users/user.service';
import { RewardTypeEnum } from 'src/modules/billing/rewards/types/reward-type.enum';

/**
 * Regression tests for the CRITICAL twitter-farming bug: updateTwitterUsername
 * used to add REGISTRATION_BONUS (3000) on EVERY call. It must now grant the
 * bonus at most once — on the first Twitter link — and never re-grant it.
 */
describe('UserService.updateTwitterUsername (registration-bonus farming)', () => {
  const createService = ({
    existingUser = { id: 1, twitterUsername: null, points: 0 },
    firstLinkAffected = 1,
  }: {
    existingUser?: { id: number; twitterUsername: string | null; points: number } | null;
    firstLinkAffected?: number;
  } = {}) => {
    const userModel = {
      findOne: jest.fn(async () => existingUser),
      update: jest.fn(async () => ({ affected: firstLinkAffected })),
      increment: jest.fn(async () => ({ affected: 1 })),
    };
    const rewardService = {
      getRewardPointsOrDefault: jest.fn(async () => 3000),
    };
    const notificationGateway = {
      emitProfileUpdate: jest.fn(async () => undefined),
    };

    const service = new UserService(
      userModel as any, // userModel
      {} as any, // likeModel
      {} as any, // tagModel
      {} as any, // postModel
      {} as any, // deviceTokenModel
      {} as any, // userActivityQueryService
      rewardService as any, // rewardService
      notificationGateway as any, // notificationGateway
      {} as any, // firebaseService
      {} as any, // uploadService
      {} as any, // referralRepository
      {} as any, // partnerShipRepository
      {} as any, // partnerShipActivityRepository
      {} as any, // partnerUserLinkRepository
      {} as any, // reportPostRepository
      {} as any, // paymentRepository
      {} as any, // dataSource
      {} as any, // providerRuntimeConfigService
    );

    return { service, userModel, rewardService, notificationGateway };
  };

  it('grants the registration bonus once on the first Twitter link', async () => {
    const { service, userModel, rewardService } = createService({
      existingUser: { id: 1, twitterUsername: null, points: 0 },
      firstLinkAffected: 1, // conditional WHERE twitterUsername IS NULL matched
    });

    await service.updateTwitterUsername(1, 'crypto_enthusiast');

    expect(userModel.update).toHaveBeenCalledTimes(1); // only the atomic claim
    expect(rewardService.getRewardPointsOrDefault).toHaveBeenCalledWith(
      RewardTypeEnum.REGISTRATION_BONUS,
      3000,
    );
    expect(userModel.increment).toHaveBeenCalledWith({ id: 1 }, 'points', 3000);
  });

  it('does NOT re-grant the bonus when a username is already linked', async () => {
    const { service, userModel, rewardService } = createService({
      existingUser: { id: 1, twitterUsername: 'already_linked', points: 5000 },
      firstLinkAffected: 0, // first-link conditional UPDATE matched nothing
    });

    await service.updateTwitterUsername(1, 'new_handle');

    expect(rewardService.getRewardPointsOrDefault).not.toHaveBeenCalled();
    expect(userModel.increment).not.toHaveBeenCalled();
    // username is still updated via the unconditional fallback UPDATE
    expect(userModel.update).toHaveBeenCalledTimes(2);
  });

  it('does not grant a second bonus when a concurrent request won the first-link race', async () => {
    const { service, userModel, rewardService } = createService({
      existingUser: { id: 1, twitterUsername: null, points: 0 }, // stale read looked unlinked
      firstLinkAffected: 0, // atomic UPDATE lost the race (row already flipped)
    });

    await service.updateTwitterUsername(1, 'handle');

    expect(rewardService.getRewardPointsOrDefault).not.toHaveBeenCalled();
    expect(userModel.increment).not.toHaveBeenCalled();
  });

  it('throws NotFound when the user does not exist', async () => {
    const { service } = createService({ existingUser: null });

    await expect(
      service.updateTwitterUsername(999, 'whatever'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
