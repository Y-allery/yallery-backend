import { ReferralFlagService } from './referral-flag.service';

describe('ReferralFlagService', () => {
  const createService = (overrides: Partial<Record<string, any>> = {}) => {
    const partnershipRepo = {
      findOne: jest.fn(),
      ...overrides.partnershipRepo,
    };
    const insertBuilder = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      updateEntity: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ raw: { affectedRows: 1 } }),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    const activityRepo = {
      findOne: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn(),
      createQueryBuilder: jest.fn(() => insertBuilder),
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

  it('writes the flag with INSERT IGNORE, so a concurrent duplicate is a no-op', async () => {
    const { service, partnershipRepo, linkRepo, activityRepo } = createService();
    partnershipRepo.findOne.mockResolvedValue({ id: 1 });
    linkRepo.findOne.mockResolvedValue({ userId: 10 });

    await expect(
      service.setReferralFlag({
        referralToken: 'token',
        partnerUserId: 'partner-user',
        flag: 'posted_to_twitter',
      }),
    ).resolves.toEqual({ status: true });

    const builder = activityRepo.createQueryBuilder.mock.results[0].value;
    expect(builder.values).toHaveBeenCalledWith({
      partnershipId: 1,
      userId: 10,
      activity: 'posted_to_twitter',
    });
    expect(builder.orIgnore).toHaveBeenCalled();
    // The unique index dedupes; no read-before-write, no full-entity save.
    expect(activityRepo.findOne).not.toHaveBeenCalled();
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

  it('does not cache a negative when a Twitter strategy could not be checked', async () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      updateEntity: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ raw: { affectedRows: 1 } }),
    };
    const { service, partnershipRepo, linkRepo, userRepo, twitterApiIoService } =
      createService({
        activityRepo: { createQueryBuilder: jest.fn(() => queryBuilder) },
      });
    partnershipRepo.findOne.mockResolvedValue({ id: 1 });
    linkRepo.findOne.mockResolvedValue({ userId: 10 });
    userRepo.findOne.mockResolvedValue({ id: 10, twitterUsername: '@tester' });

    // Timeline endpoints are down (their failures are swallowed internally),
    // while search legitimately answers "nothing found".
    twitterApiIoService.getUserProfile.mockRejectedValue(new Error('429'));
    twitterApiIoService.getUserLastTweets.mockRejectedValue(new Error('429'));
    twitterApiIoService.searchTweets.mockResolvedValue({ tweets: [] });

    const params = {
      referralToken: 'token',
      partnerUserId: 'partner-user',
      flag: 'retweet',
    };
    await expect(service.checkReferralFlag(params)).resolves.toEqual({
      status: 'false',
    });

    // The user then retweets. Because the outage was never cached as a
    // negative, the next call must re-check Twitter rather than replay 'false'.
    twitterApiIoService.getUserProfile.mockResolvedValue({ id: 'tw-1' });
    twitterApiIoService.getUserTimeline.mockResolvedValue({
      tweets: [{ full_text: 'hello y_allery', id_str: 't-1' }],
      has_next_page: false,
      next_cursor: '',
    });

    await expect(service.checkReferralFlag(params)).resolves.toEqual({
      status: 'true',
    });
  });

  it('checks profile timeline and saves retweet activity on y_allery match', async () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      updateEntity: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ raw: { affectedRows: 1 } }),
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
    expect(queryBuilder.values).toHaveBeenCalledWith({
      partnershipId: 1,
      userId: 10,
      activity: 'retweet',
    });
    expect(queryBuilder.orIgnore).toHaveBeenCalled();
  });

  it('falls back to y_allery mention search when timeline endpoints do not surface profile content', async () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      updateEntity: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ raw: { affectedRows: 1 } }),
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
    twitterApiIoService.searchTweets.mockResolvedValue({
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

    expect(twitterApiIoService.searchTweets).toHaveBeenCalledTimes(1);
    // `from:` scopes the search to the user's own tweets. A bare
    // `y_allery tester` would instead match tweets *mentioning* the handle,
    // which the user's own retweet does not contain.
    expect(twitterApiIoService.searchTweets).toHaveBeenCalledWith(
      'from:tester y_allery',
      'Latest',
    );
    expect(queryBuilder.values).toHaveBeenCalledWith({
      partnershipId: 1,
      userId: 10,
      activity: 'retweet',
    });
  });

  it('checks at most two pages per timeline strategy and one search query', async () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      updateEntity: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ raw: { affectedRows: 1 } }),
    };
    const { service, partnershipRepo, linkRepo, userRepo, twitterApiIoService } =
      createService({
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
    const endlessPage = {
      tweets: [],
      has_next_page: true,
      next_cursor: 'next',
    };
    twitterApiIoService.getUserTimeline.mockResolvedValue(endlessPage);
    twitterApiIoService.getUserLastTweets.mockResolvedValue(endlessPage);
    twitterApiIoService.searchTweets.mockResolvedValue({ tweets: [] });

    await expect(
      service.checkReferralFlag({
        referralToken: 'token',
        partnerUserId: 'partner-user',
        flag: 'retweet',
      }),
    ).resolves.toEqual({ status: 'false' });

    expect(twitterApiIoService.getUserTimeline).toHaveBeenCalledTimes(2);
    expect(twitterApiIoService.getUserLastTweets).toHaveBeenCalledTimes(2);
    expect(twitterApiIoService.searchTweets).toHaveBeenCalledTimes(1);
  });

  it('caches a negative retweet result and skips the Twitter cascade on the next check', async () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      updateEntity: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ raw: { affectedRows: 1 } }),
    };
    const { service, partnershipRepo, linkRepo, userRepo, twitterApiIoService } =
      createService({
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
    const emptyPage = { tweets: [], has_next_page: false, next_cursor: '' };
    twitterApiIoService.getUserTimeline.mockResolvedValue(emptyPage);
    twitterApiIoService.getUserLastTweets.mockResolvedValue(emptyPage);
    twitterApiIoService.searchTweets.mockResolvedValue({ tweets: [] });

    const params = {
      referralToken: 'token',
      partnerUserId: 'partner-user',
      flag: 'retweet',
    };

    await expect(service.checkReferralFlag(params)).resolves.toEqual({
      status: 'false',
    });
    expect(twitterApiIoService.getUserProfile).toHaveBeenCalledTimes(1);

    await expect(service.checkReferralFlag(params)).resolves.toEqual({
      status: 'false',
    });
    expect(twitterApiIoService.getUserProfile).toHaveBeenCalledTimes(1);
    expect(twitterApiIoService.searchTweets).toHaveBeenCalledTimes(1);
  });

  it('does not cache a negative result when the Twitter check errors', async () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      updateEntity: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ raw: { affectedRows: 1 } }),
    };
    const { service, partnershipRepo, linkRepo, userRepo, twitterApiIoService } =
      createService({
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
    const emptyPage = { tweets: [], has_next_page: false, next_cursor: '' };
    twitterApiIoService.getUserTimeline.mockResolvedValue(emptyPage);
    twitterApiIoService.getUserLastTweets.mockResolvedValue(emptyPage);
    twitterApiIoService.searchTweets.mockRejectedValue(
      new Error('twitter down'),
    );

    const params = {
      referralToken: 'token',
      partnerUserId: 'partner-user',
      flag: 'retweet',
    };

    await expect(service.checkReferralFlag(params)).resolves.toEqual({
      status: 'false',
    });
    await expect(service.checkReferralFlag(params)).resolves.toEqual({
      status: 'false',
    });
    expect(twitterApiIoService.getUserProfile).toHaveBeenCalledTimes(2);
  });
});
