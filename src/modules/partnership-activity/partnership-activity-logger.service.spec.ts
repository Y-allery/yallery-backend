import { PartnershipActivityLoggerService } from './partnership-activity-logger.service';

describe('PartnershipActivityLoggerService', () => {
  const createService = (options?: {
    links?: Array<{ partnershipId: number; userId: number }>;
    insertRejects?: boolean;
  }) => {
    const partnerUserLinkRepository = {
      find: jest.fn(async () => options?.links ?? []),
    };
    const insertQueryBuilder = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      updateEntity: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => {
        if (options?.insertRejects) {
          throw new Error('insert failed');
        }
        return { raw: { affectedRows: options?.links?.length ?? 0 } };
      }),
    };
    const partnershipActivityRepository = {
      createQueryBuilder: jest.fn(() => insertQueryBuilder),
    };

    const service = new PartnershipActivityLoggerService(
      partnerUserLinkRepository as any,
      partnershipActivityRepository as any,
    );
    const loggerErrorSpy = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);
    const loggerWarnSpy = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => undefined);

    return {
      service,
      partnerUserLinkRepository,
      partnershipActivityRepository,
      insertQueryBuilder,
      loggerErrorSpy,
      loggerWarnSpy,
    };
  };

  it('does not write when the user has no partner links', async () => {
    const { service, partnershipActivityRepository } = createService();

    await service.logOnceForUser(10, 'image_generated');

    expect(partnershipActivityRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('warns and skips when userId or activity is missing', async () => {
    const { service, partnerUserLinkRepository, loggerWarnSpy } =
      createService();

    await service.logOnceForUser(0, 'image_generated');
    await service.logOnceForUser(10, '   ');

    expect(loggerWarnSpy).toHaveBeenCalledTimes(2);
    expect(partnerUserLinkRepository.find).not.toHaveBeenCalled();
  });

  it('inserts one activity for one partner link', async () => {
    const { service, insertQueryBuilder } = createService({
      links: [{ partnershipId: 3, userId: 10 }],
    });

    await service.logOnceForUser(10, 'image_generated');

    expect(insertQueryBuilder.values).toHaveBeenCalledWith([
      { partnershipId: 3, userId: 10, activity: 'image_generated' },
    ]);
    expect(insertQueryBuilder.orIgnore).toHaveBeenCalled();
    expect(insertQueryBuilder.execute).toHaveBeenCalledTimes(1);
  });

  it('inserts all partnership links in a single bulk statement', async () => {
    const { service, insertQueryBuilder } = createService({
      links: [
        { partnershipId: 3, userId: 10 },
        { partnershipId: 4, userId: 10 },
      ],
    });

    await service.logOnceForUser(10, 'image_generated');

    expect(insertQueryBuilder.values).toHaveBeenCalledWith([
      { partnershipId: 3, userId: 10, activity: 'image_generated' },
      { partnershipId: 4, userId: 10, activity: 'image_generated' },
    ]);
    expect(insertQueryBuilder.execute).toHaveBeenCalledTimes(1);
  });

  it('logs and does not throw when the insert fails', async () => {
    const { service, loggerErrorSpy } = createService({
      links: [{ partnershipId: 3, userId: 10 }],
      insertRejects: true,
    });

    await expect(
      service.logOnceForUser(10, 'image_generated'),
    ).resolves.toBeUndefined();
    expect(loggerErrorSpy).toHaveBeenCalled();
  });
});
