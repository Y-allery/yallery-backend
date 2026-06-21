import { BadRequestException } from '@nestjs/common';
import { ContestService } from './contest.service';
import { UserEntity } from 'src/modules/users/entities/user.entity';

/**
 * Regression tests for the legacy (non-V2) setContestWinner double-payout.
 * It checked winner/isApproved in memory then credited the prize via a
 * read-modify-write save with no transaction or idempotency row, so two
 * concurrent admin requests (or a retry) both paid out. The payout must now be
 * gated by an atomic state transition.
 */
describe('ContestService.setContestWinner (legacy double-payout)', () => {
  const createService = ({
    contest = {
      id: 1,
      reward: 1000,
      winner: null,
      isApproved: false,
      contestType: undefined, // not FINE_TUNE -> skip retweet check
      name: 'C',
      imageUrl: null,
    },
    post = {
      id: 50,
      user: { id: 9 },
      imageUrl: 'http://i',
      previewImageUrl: null,
      tweetLink: null,
    },
    claimAffected = 1,
    isV2 = false,
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
    const contestRepository = {
      findOne: jest.fn(async () => contest),
      manager: { transaction: jest.fn(async (cb: any) => cb(manager)) },
    };
    const postRepository = { findOne: jest.fn(async () => post) };
    const userService = {
      sendPushNotificationIfEnabled: jest.fn(async () => undefined),
    };
    const userActivityService = { logContestWon: jest.fn(async () => undefined) };
    const notificationGateway = {
      emitProfileUpdate: jest.fn(async () => undefined),
    };
    const contestFlowService = { isV2Contest: jest.fn(async () => isV2) };

    const service = new ContestService(
      contestRepository as any, // 1 contestRepository
      {} as any, // 2 userRepository
      postRepository as any, // 3 postRepository
      {} as any, // 4 tagRepository
      {} as any, // 5 mediaAISettingsRepository
      {} as any, // 6 aiFinetuneRepository
      {} as any, // 7 deviceTokenModel
      userService as any, // 8 userService
      userActivityService as any, // 9 userActivityService
      {} as any, // 10 firebaseService
      notificationGateway as any, // 11 notificationGateway
      {} as any, // 12 rewardService
      contestFlowService as any, // 13 contestFlowService
      {} as any, // 14 twitterApiIoService
    );

    return { service, increment, contestRepository };
  };

  it('pays the prize once when the atomic state transition wins', async () => {
    const { service, increment } = createService({ claimAffected: 1 });

    const result = await service.setContestWinner({
      post_id: 50,
      contest_id: 1,
    } as any);

    expect(result.success).toBe(true);
    expect(increment).toHaveBeenCalledWith({ id: 9 }, 'points', 1000);
  });

  it('does NOT double-pay when a concurrent request already closed the contest', async () => {
    const { service, increment } = createService({ claimAffected: 0 });

    await expect(
      service.setContestWinner({ post_id: 50, contest_id: 1 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(increment).not.toHaveBeenCalled();
  });

  it('rejects (fast-fail) when the contest already has an approved winner', async () => {
    const { service, contestRepository } = createService({
      contest: {
        id: 1,
        reward: 1000,
        winner: { id: 2 },
        isApproved: true,
        contestType: undefined,
        name: 'C',
        imageUrl: null,
      },
    });

    await expect(
      service.setContestWinner({ post_id: 50, contest_id: 1 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(contestRepository.manager.transaction).not.toHaveBeenCalled();
  });
});
