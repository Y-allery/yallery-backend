import { ReferralFlagService } from './referral-flag.service';

describe('ReferralFlagService', () => {
  const createService = (overrides: Partial<Record<string, any>> = {}) => {
    const partnershipRepo = {
      findOne: jest.fn(),
      ...overrides.partnershipRepo,
    };
    const activityRepo = {
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      })),
      ...overrides.activityRepo,
    };
    const linkRepo = {
      findOne: jest.fn(),
      ...overrides.linkRepo,
    };
    const userRepo = {
      findOne: jest.fn(),
      ...overrides.userRepo,
    };
    const twitterApiIoService = {
      getUserProfile: jest.fn(),
      getUserTimeline: jest.fn(),
      getUserLastTweets: jest.fn(),
      searchTweets: jest.fn(),
      ...overrides.twitterApiIoService,
    };

    return {
      service: new ReferralFlagService(
        partnershipRepo as any,
        activityRepo as any,
        linkRepo as any,
        userRepo as any,
        twitterApiIoService as any,
      ),
      partnershipRepo,
      activityRepo,
      linkRepo,
      userRepo,
      twitterApiIoService,
    };
  };

  it('returns false for an unknown referral token', async () => {
    const { service, partnershipRepo } = createService();
    partnershipRepo.findOne.mockResolvedValue(null);

    await expect(
      service.checkReferralFlag({
        referralToken: 'missing',
        partnerUserId: 'partner-user',
        flag: 'posted_to_twitter',
      }),
    ).resolves.toEqual({ status: 'false' });
  });

  it('returns false when a referral token has no linked user', async () => {
    const { service, partnershipRepo, linkRepo } = createService();
    partnershipRepo.findOne.mockResolvedValue({ id: 1 });
    linkRepo.findOne.mockResolvedValue(null);

    await expect(
      service.setReferralFlag({
        referralToken: 'token',
        partnerUserId: 'partner-user',
        flag: 'posted_to_twitter',
      }),
    ).resolves.toEqual({ status: false });
  });

  it('does not duplicate an existing activity flag', async () => {
    const { service, partnershipRepo, linkRepo, activityRepo } = createService();
    partnershipRepo.findOne.mockResolvedValue({ id: 1 });
    linkRepo.findOne.mockResolvedValue({ userId: 10 });
    activityRepo.findOne.mockResolvedValue({ id: 20 });

    await expect(
      service.setReferralFlag({
        referralToken: 'token',
        partnerUserId: 'partner-user',
        flag: 'posted_to_twitter',
      }),
    ).resolves.toEqual({ status: true });

    expect(activityRepo.create).not.toHaveBeenCalled();
    expect(activityRepo.save).not.toHaveBeenCalled();
  });

  it('does not call TwitterAPI.io when retweet activity is cached', async () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ id: 99 }),
    };
    const {
      service,
      partnershipRepo,
      linkRepo,
      activityRepo,
      twitterApiIoService,
    } = createService({
      activityRepo: {
        createQueryBuilder: jest.fn(() => queryBuilder),
      },
    });
    partnershipRepo.findOne.mockResolvedValue({ id: 1 });
    linkRepo.findOne.mockResolvedValue({ userId: 10 });

    await expect(
      service.checkReferralFlag({
        referralToken: 'token',
        partnerUserId: 'partner-user',
        flag: 'retweet',
      }),
    ).resolves.toEqual({ status: 'true' });

    expect(activityRepo.createQueryBuilder).toHaveBeenCalled();
    expect(twitterApiIoService.searchTweets).not.toHaveBeenCalled();
  });

  it('checks profile timeline and saves retweet activity on y_allery match', async () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    const {
      service,
      partnershipRepo,
      linkRepo,
      userRepo,
      activityRepo,
      twitterApiIoService,
    } = createService({
      activityRepo: {
        createQueryBuilder: jest.fn(() => queryBuilder),
      },
    });
    partnershipRepo.findOne.mockResolvedValue({ id: 1 });
    linkRepo.findOne.mockResolvedValue({ userId: 10 });
    userRepo.findOne.mockResolvedValue({ id: 10, twitterUsername: '@tester' });
    twitterApiIoService.getUserProfile.mockResolvedValue({
      id: 'twitter-user-id',
    });
    twitterApiIoService.getUserTimeline.mockResolvedValue({
      tweets: [{ full_text: 'hello y_allery', id_str: 'tweet-1' }],
      has_next_page: false,
      next_cursor: '',
    });

    await expect(
      service.checkReferralFlag({
        referralToken: 'token',
        partnerUserId: 'partner-user',
        flag: 'retweet',
      }),
    ).resolves.toEqual({ status: 'true' });

    expect(twitterApiIoService.getUserTimeline).toHaveBeenCalledWith(
      'twitter-user-id',
      {
        cursor: '',
        includeReplies: true,
        includeParentTweet: false,
      },
    );
    expect(twitterApiIoService.searchTweets).not.toHaveBeenCalled();
    expect(activityRepo.create).toHaveBeenCalledWith({
      partnershipId: 1,
      userId: 10,
      activity: 'retweet',
    });
    expect(activityRepo.save).toHaveBeenCalled();
  });

  it('falls back to y_allery mention search when timeline endpoints do not surface profile content', async () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    const {
      service,
      partnershipRepo,
      linkRepo,
      userRepo,
      activityRepo,
      twitterApiIoService,
    } = createService({
      activityRepo: {
        createQueryBuilder: jest.fn(() => queryBuilder),
      },
    });
    partnershipRepo.findOne.mockResolvedValue({ id: 1 });
    linkRepo.findOne.mockResolvedValue({ userId: 10 });
    userRepo.findOne.mockResolvedValue({ id: 10, twitterUsername: '@tester' });
    twitterApiIoService.getUserProfile.mockResolvedValue({
      id: 'twitter-user-id',
    });
    twitterApiIoService.getUserTimeline.mockResolvedValue({
      tweets: [],
      has_next_page: false,
      next_cursor: '',
    });
    twitterApiIoService.getUserLastTweets.mockResolvedValue({
      tweets: [],
      has_next_page: false,
      next_cursor: '',
    });
    twitterApiIoService.searchTweets
      .mockResolvedValueOnce({ tweets: [] })
      .mockResolvedValueOnce({ tweets: [] })
      .mockResolvedValueOnce({
        tweets: [
          {
            full_text: 'Generated by @tester #nomisma',
            author: { userName: 'y_allery' },
          },
        ],
      });

    await expect(
      service.checkReferralFlag({
        referralToken: 'token',
        partnerUserId: 'partner-user',
        flag: 'retweet',
      }),
    ).resolves.toEqual({ status: 'true' });

    expect(twitterApiIoService.searchTweets).toHaveBeenCalledWith(
      'y_allery tester',
      'Latest',
    );
    expect(activityRepo.create).toHaveBeenCalledWith({
      partnershipId: 1,
      userId: 10,
      activity: 'retweet',
    });
  });
});
