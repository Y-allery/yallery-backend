import { PartnershipActivityLoggerService } from './partnership-activity-logger.service';

describe('PartnershipActivityLoggerService', () => {
  const createService = (options?: {
    links?: Array<{ partnershipId: number; userId: number }>;
    existingKeys?: string[];
    saveRejects?: boolean;
  }) => {
    const existingKeys = new Set(options?.existingKeys ?? []);
    const partnerUserLinkRepository = {
      find: jest.fn(async () => options?.links ?? []),
    };
    const partnershipActivityRepository = {
      findOne: jest.fn(async ({ where }) => {
        const key = `${where.partnershipId}:${where.userId}:${where.activity}`;
        return existingKeys.has(key) ? { id: 1, ...where } : null;
      }),
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => {
        if (options?.saveRejects) {
          throw new Error('save failed');
        }
        return { id: 1, ...data };
      }),
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
      loggerErrorSpy,
      loggerWarnSpy,
    };
  };

  it('does not write when the user has no partner links', async () => {
    const { service, partnershipActivityRepository } = createService();

    await service.logOnceForUser(10, 'image_generated');

    expect(partnershipActivityRepository.findOne).not.toHaveBeenCalled();
    expect(partnershipActivityRepository.save).not.toHaveBeenCalled();
  });

  it('creates one activity for one partner link', async () => {
    const { service, partnershipActivityRepository } = createService({
      links: [{ partnershipId: 3, userId: 10 }],
    });

    await service.logOnceForUser(10, 'image_generated');

    expect(partnershipActivityRepository.create).toHaveBeenCalledWith({
      partnershipId: 3,
      userId: 10,
      activity: 'image_generated',
    });
    expect(partnershipActivityRepository.save).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate an existing activity', async () => {
    const { service, partnershipActivityRepository } = createService({
      links: [{ partnershipId: 3, userId: 10 }],
      existingKeys: ['3:10:image_generated'],
    });

    await service.logOnceForUser(10, 'image_generated');

    expect(partnershipActivityRepository.create).not.toHaveBeenCalled();
    expect(partnershipActivityRepository.save).not.toHaveBeenCalled();
  });

  it('creates one activity per partnership link', async () => {
    const { service, partnershipActivityRepository } = createService({
      links: [
        { partnershipId: 3, userId: 10 },
        { partnershipId: 4, userId: 10 },
      ],
    });

    await service.logOnceForUser(10, 'image_generated');

    expect(partnershipActivityRepository.save).toHaveBeenCalledTimes(2);
    expect(partnershipActivityRepository.create).toHaveBeenCalledWith({
      partnershipId: 3,
      userId: 10,
      activity: 'image_generated',
    });
    expect(partnershipActivityRepository.create).toHaveBeenCalledWith({
      partnershipId: 4,
      userId: 10,
      activity: 'image_generated',
    });
  });

  it('logs and does not throw when save fails', async () => {
    const { service, loggerErrorSpy } = createService({
      links: [{ partnershipId: 3, userId: 10 }],
      saveRejects: true,
    });

    await expect(
      service.logOnceForUser(10, 'image_generated'),
    ).resolves.toBeUndefined();
    expect(loggerErrorSpy).toHaveBeenCalled();
  });
});
