import { NotFoundException } from '@nestjs/common';
import { PostPublishService } from './post-publish.service';

/**
 * Regression tests for the share() daily-reward TOCTOU. It read
 * lastShareRewardAt, then set it + added points via a full-entity save with no
 * atomicity, so two concurrent same-day shares both awarded the bonus. The
 * award must now be a single conditional UPDATE.
 */
describe('PostPublishService.share (daily-reward TOCTOU)', () => {
  const createService = ({
    user = { id: 5, lastShareRewardAt: null, points: 0 },
    awardAffected = 1,
  }: any = {}) => {
    const awardQb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => ({ affected: awardAffected })),
    };
    const userRepository = {
      findOne: jest.fn(async () => user),
      createQueryBuilder: jest.fn(() => awardQb),
    };
    const notificationGateway = {
      emitProfileUpdate: jest.fn(async () => undefined),
    };
    const rewardService = { getRewardPointsOrDefault: jest.fn(async () => 5) };

    const service = new PostPublishService(
      {} as any, // postRepository
      userRepository as any, // userRepository
      {} as any, // contestService
      {} as any, // tagService
      notificationGateway as any, // notificationGateway
      rewardService as any, // rewardService
    );

    return { service, userRepository, notificationGateway };
  };

  it('awards share points once when the conditional update wins', async () => {
    const { service, notificationGateway } = createService({ awardAffected: 1 });

    const result = await service.share(5);

    expect(result.pointsAwarded).toBe(5);
    expect(notificationGateway.emitProfileUpdate).toHaveBeenCalledWith('5');
  });

  it('does not double-award when a concurrent share already claimed today', async () => {
    const { service, notificationGateway } = createService({ awardAffected: 0 });

    const result = await service.share(5);

    expect(result.pointsAwarded).toBe(0);
    expect(notificationGateway.emitProfileUpdate).not.toHaveBeenCalled();
  });

  it('fast-fails (no UPDATE) when already rewarded today', async () => {
    const { service, userRepository } = createService({
      user: { id: 5, lastShareRewardAt: new Date(), points: 0 },
    });

    const result = await service.share(5);

    expect(result.pointsAwarded).toBe(0);
    expect(userRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('throws NotFound when the user is missing', async () => {
    const { service } = createService({ user: null });

    await expect(service.share(5)).rejects.toBeInstanceOf(NotFoundException);
  });
});
