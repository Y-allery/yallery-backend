import { EconomyService } from './economy.service';
import { RewardTypeEnum } from 'src/modules/billing/rewards/types/reward-type.enum';
import { MediaGenerationPricingService } from 'src/modules/media-generation/application/pricing/media-generation-pricing.service';

describe('EconomyService', () => {
  const rewardRow = (
    rewardType: RewardTypeEnum,
    points: number,
    extra: Partial<{ isDaily: boolean; isActive: boolean; description: string }> = {},
  ) => ({
    rewardType,
    points,
    isDaily: extra.isDaily ?? false,
    isActive: extra.isActive ?? true,
    description: extra.description ?? null,
  });

  const buildService = (
    rewards: unknown[],
    aiSettings: unknown[],
    caps: Record<string, number> = {},
  ) => {
    const pricingService = new MediaGenerationPricingService(null as never);
    return new EconomyService(
      { find: jest.fn(async () => rewards) } as never,
      { find: jest.fn(async () => aiSettings) } as never,
      pricingService,
      {
        getNumber: jest.fn(
          async (key: string, fallback: number) => caps[key] ?? fallback,
        ),
      } as never,
    );
  };

  it('reports live like economics with the right direction', async () => {
    const service = buildService(
      [
        rewardRow(RewardTypeEnum.LIKE_EARN, 5, {
          description: 'Points earned when someone likes your post',
        }),
        rewardRow(RewardTypeEnum.LIKE_SPEND, 15),
      ],
      [],
    );

    const economy = await service.getEconomy();

    expect(economy.earn.likeReceived).toMatchObject({
      points: 5,
      direction: 'earn',
      rewardType: 'LIKE_EARN',
      active: true,
    });
    expect(economy.spend.likeGiven).toMatchObject({
      points: 15,
      direction: 'spend',
    });
    expect(economy.currency.code).toBe('YEP');
  });

  it('falls back to code defaults when a reward row is missing', async () => {
    const service = buildService([], []);

    const economy = await service.getEconomy();

    expect(economy.earn.dailyLogin.points).toBe(100);
    expect(economy.spend.likeGiven.points).toBe(15);
    expect(economy.earn.registrationBonus.points).toBe(500);
  });

  it('exposes referral caps from runtime settings', async () => {
    const service = buildService(
      [rewardRow(RewardTypeEnum.REFERRAL_REWARD, 500)],
      [],
      { REFERRAL_REWARD_DAILY_CAP: 7, REFERRAL_REWARD_LIFETIME_CAP: 21 },
    );

    const economy = await service.getEconomy();

    expect(economy.earn.referral).toMatchObject({
      points: 500,
      bothSides: true,
      dailyCap: 7,
      lifetimeCap: 21,
      requiresReferredGeneration: true,
    });
  });

  it('resolves per-second video pricing into concrete duration costs', async () => {
    const service = buildService(
      [],
      [
        {
          aiService: 'p_video_text',
          name: 'YEngine',
          capability: 'video_generate',
          cost: 50,
          settings: {
            durations: [5, 10],
            pricing: { strategy: 'per_second', creditsPerSecond: 35 },
          },
        },
        {
          aiService: 'z_image_turbo',
          name: 'Z-Image Turbo',
          capability: 'image_generate',
          cost: 55,
          settings: null,
        },
      ],
    );

    const economy = await service.getEconomy();

    expect(economy.generation.video[0]).toMatchObject({
      aiService: 'p_video_text',
      strategy: 'per_second',
      creditsPerSecond: 35,
      durationCosts: { '5': 175, '10': 350 },
    });
    expect(economy.generation.image[0]).toMatchObject({
      aiService: 'z_image_turbo',
      points: 55,
      strategy: 'fixed',
      creditsPerSecond: null,
      durationCosts: null,
    });
  });
});
