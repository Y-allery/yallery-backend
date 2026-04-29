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
    const tweetScoutReferralService = {
      checkRetweet: jest.fn(),
      ...overrides.tweetScoutReferralService,
    };

    return {
      service: new ReferralFlagService(
        partnershipRepo as any,
        activityRepo as any,
        linkRepo as any,
        userRepo as any,
        tweetScoutReferralService as any,
      ),
      partnershipRepo,
      activityRepo,
      linkRepo,
      userRepo,
      tweetScoutReferralService,
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
});
