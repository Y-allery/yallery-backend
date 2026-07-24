import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LikeService } from './like.service';
import { LikeEntity } from './entities/like.entity';

/**
 * Regression tests for the createLike double-spend race. The balance and
 * existing-like checks used to run OUTSIDE the transaction and the debit was
 * unconditional with no UNIQUE(user,post) index, so concurrent double-taps
 * double-spent and could drive balances negative. Crediting must now rely on
 * the unique index for idempotency and a conditional debit guarded on balance.
 */
describe('LikeService.createLike (double-spend race)', () => {
  const createService = ({
    user = { id: 10, points: 1000 },
    post = { id: 20, user: { id: 30 }, imageUrl: 'http://img', previewImageUrl: null },
    saveImpl = jest.fn(async (e: any) => e),
    spendAffected = 1,
  }: any = {}) => {
    const likeManagerRepo = {
      save: saveImpl,
      create: jest.fn((data: any) => data),
    };

    const execute = jest.fn(async () => ({ affected: spendAffected }));
    const qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute,
    };
    const increment = jest.fn(async () => ({ affected: 1 }));
    const userManagerRepo = {
      createQueryBuilder: jest.fn(() => qb),
      increment,
    };

    const manager = {
      getRepository: jest.fn((entity: any) =>
        entity === LikeEntity ? likeManagerRepo : userManagerRepo,
      ),
    };
    const dataSource = { transaction: jest.fn(async (cb: any) => cb(manager)) };

    const likeRepository = { findOne: jest.fn() };
    const postRepository = { findOne: jest.fn(async () => post) };
    const userRepository = { findOne: jest.fn(async () => user) };
    const userActivityService = {
      logLikeReceived: jest.fn(async () => undefined),
      logLikeSpent: jest.fn(async () => undefined),
    };
    const rewardService = {
      getRewardPointsOrDefault: jest.fn(async (_type: any, def: number) => def),
    };
    const likeNotificationQueueService = {
      enqueueLikeNotification: jest.fn(async () => undefined),
    };

    const service = new LikeService(
      likeRepository as any,
      postRepository as any,
      userRepository as any,
      userActivityService as any,
      rewardService as any,
      likeNotificationQueueService as any,
      dataSource as any,
    );

    return {
      service,
      saveImpl,
      execute,
      increment,
      likeNotificationQueueService,
      userActivityService,
    };
  };

  it('likes once: conditional debit of liker, atomic credit of author', async () => {
    const { service, execute, increment } = createService({ spendAffected: 1 });

    const result = await service.createLike({ postId: 20 } as any, 10);

    expect(result).toBe('success');
    expect(execute).toHaveBeenCalledTimes(1); // conditional spend ran
    expect(increment).toHaveBeenCalledWith({ id: 30 }, 'points', 5); // author earns
  });

  it('rejects a duplicate like via the unique index and never spends', async () => {
    const dupErr: any = new Error('duplicate');
    dupErr.code = 'ER_DUP_ENTRY';
    dupErr.errno = 1062;
    const saveImpl = jest.fn(async () => {
      throw dupErr;
    });
    const { service, execute, increment } = createService({ saveImpl });

    await expect(service.createLike({ postId: 20 } as any, 10)).rejects.toThrow(
      'already liked',
    );
    expect(execute).not.toHaveBeenCalled();
    expect(increment).not.toHaveBeenCalled();
  });

  it('aborts (no negative balance) when the conditional debit matches no row', async () => {
    const { service, increment } = createService({ spendAffected: 0 });

    await expect(service.createLike({ postId: 20 } as any, 10)).rejects.toThrow(
      'does not have enough points',
    );
    expect(increment).not.toHaveBeenCalled(); // author not credited on failed spend
  });

  it('forbids liking your own post (before any DB write)', async () => {
    const { service, execute } = createService({
      post: { id: 20, user: { id: 10 } }, // author === liker
    });

    await expect(service.createLike({ postId: 20 } as any, 10)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('throws NotFound when the user or post is missing', async () => {
    const { service } = createService({ user: null });

    await expect(service.createLike({ postId: 20 } as any, 10)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('logs both activities and queues the push/profile fan-out', async () => {
    const { service, userActivityService, likeNotificationQueueService } =
      createService();

    await service.createLike({ postId: 20 } as any, 10);

    expect(userActivityService.logLikeReceived).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 30, actorUserId: 10, pointsDelta: 5 }),
    );
    expect(userActivityService.logLikeSpent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 10, pointsDelta: -15 }),
    );
    expect(
      likeNotificationQueueService.enqueueLikeNotification,
    ).toHaveBeenCalledWith({ postOwnerId: 30, likerId: 10, postId: 20 });
  });

  it('never queues notifications for a rejected like', async () => {
    const { service, likeNotificationQueueService } = createService({
      spendAffected: 0,
    });

    await expect(service.createLike({ postId: 20 } as any, 10)).rejects.toThrow(
      'does not have enough points',
    );
    expect(
      likeNotificationQueueService.enqueueLikeNotification,
    ).not.toHaveBeenCalled();
  });

  it('still succeeds when the notification queue is unreachable', async () => {
    const { service, likeNotificationQueueService } = createService();
    // The queue service swallows Redis failures itself; reject anyway to prove
    // the committed like can never be reported as a failure.
    likeNotificationQueueService.enqueueLikeNotification.mockRejectedValue(
      new Error('redis down'),
    );

    await expect(service.createLike({ postId: 20 } as any, 10)).resolves.toBe(
      'success',
    );
  });
});
