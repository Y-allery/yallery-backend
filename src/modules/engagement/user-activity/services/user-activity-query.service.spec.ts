import { UserActivityQueryService } from './user-activity-query.service';

/**
 * The feed supports limit/beforeId cursor pagination, but stays unbounded when
 * no limit is passed: the mobile client sends none and has no paging UI, so a
 * default cap would silently truncate a heavy user's history.
 */
describe('UserActivityQueryService.getUserActivities (feed bounds)', () => {
  const createService = (activities: any[] = []) => {
    const qb: any = {
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => activities),
    };
    const repository = {
      createQueryBuilder: jest.fn(() => qb),
    } as any;

    const service = new UserActivityQueryService(repository);

    return { service, qb };
  };

  it('does not cap the feed when no limit is passed', async () => {
    const { service, qb } = createService();

    await service.getUserActivities({ userId: 1 });

    expect(qb.take).not.toHaveBeenCalled();
    expect(qb.orderBy).toHaveBeenCalledWith('activity.createdAt', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('activity.id', 'DESC');
  });

  it('applies a custom limit', async () => {
    const { service, qb } = createService();

    await service.getUserActivities({ userId: 1, limit: 25 });

    expect(qb.take).toHaveBeenCalledWith(25);
  });

  it('applies the beforeId cursor only when provided', async () => {
    const { service, qb } = createService();

    await service.getUserActivities({ userId: 1, beforeId: 500 });

    expect(qb.andWhere).toHaveBeenCalledWith('activity.id < :beforeId', {
      beforeId: 500,
    });

    const { service: service2, qb: qb2 } = createService();
    await service2.getUserActivities({ userId: 1 });
    const cursorCalls = qb2.andWhere.mock.calls.filter(
      ([clause]: [string]) => clause === 'activity.id < :beforeId',
    );
    expect(cursorCalls).toHaveLength(0);
  });

  it('keeps the response shape unchanged', async () => {
    const createdAt = new Date('2026-07-01T00:00:00Z');
    const { service } = createService([
      {
        id: 7,
        type: 'like_received',
        category: 'social',
        pointsDelta: 5,
        descriptionSnapshot: 'desc',
        previewUrl: 'http://img',
        payload: { a: 1 },
        isRead: false,
        readAt: null,
        createdAt,
        actorUser: { id: 2, nickname: 'nick', avatar: 'ava' },
        post: { id: 3 },
        contest: null,
      },
    ]);

    await expect(service.getUserActivities({ userId: 1 })).resolves.toEqual([
      {
        id: 7,
        activityType: 'like_received',
        category: 'social',
        pointsDelta: 5,
        description: 'desc',
        previewUrl: 'http://img',
        payload: { a: 1 },
        isRead: false,
        readAt: null,
        createdAt,
        actorUser: { id: 2, nickname: 'nick', avatar: 'ava' },
        post: { id: 3 },
        contest: null,
      },
    ]);
  });
});
