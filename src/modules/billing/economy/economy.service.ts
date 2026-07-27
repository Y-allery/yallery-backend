import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RewardEntity } from 'src/modules/billing/rewards/entities/reward.entity';
import { RewardTypeEnum } from 'src/modules/billing/rewards/types/reward-type.enum';
import { MediaAISettingsEntity } from 'src/modules/media-generation/persistence/entities/media-ai-settings.entity';
import { MediaGenerationPricingService } from 'src/modules/media-generation/application/pricing/media-generation-pricing.service';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';
import {
  REFERRAL_REWARD_DEFAULTS,
  REFERRAL_REWARD_SETTING_KEYS,
} from 'src/modules/users/referral/referral-reward.contract';
import {
  EconomyGenerationPriceResponse,
  EconomyReferralResponse,
  EconomyResponse,
  EconomyRuleResponse,
} from './economy.types';

/** Fallbacks used only when a reward row is missing; they mirror the code defaults. */
const RULE_FALLBACKS: Partial<Record<RewardTypeEnum, number>> = {
  [RewardTypeEnum.LIKE_EARN]: 5,
  [RewardTypeEnum.LIKE_SPEND]: 15,
  [RewardTypeEnum.DAILY_LOGIN]: 100,
  [RewardTypeEnum.POST_PHOTO_REWARD]: 30,
  [RewardTypeEnum.POST_VIDEO_REWARD]: 50,
  [RewardTypeEnum.CONTEST_PARTICIPATION]: 100,
  [RewardTypeEnum.RATE_APP]: 100,
  [RewardTypeEnum.SHARE_YEPS]: 5,
  [RewardTypeEnum.REGISTRATION_BONUS]: 500,
  [RewardTypeEnum.REFERRAL_REWARD]: 500,
};

@Injectable()
export class EconomyService {
  constructor(
    @InjectRepository(RewardEntity)
    private readonly rewardRepository: Repository<RewardEntity>,
    @InjectRepository(MediaAISettingsEntity)
    private readonly aiSettingsRepository: Repository<MediaAISettingsEntity>,
    private readonly pricingService: MediaGenerationPricingService,
    private readonly providerRuntimeConfigService: ProviderRuntimeConfigService,
  ) {}

  async getEconomy(): Promise<EconomyResponse> {
    const [rewards, aiSettings, dailyCap, lifetimeCap] = await Promise.all([
      this.rewardRepository.find(),
      this.aiSettingsRepository.find({
        where: { isActive: true },
        order: { id: 'ASC' },
      }),
      this.providerRuntimeConfigService.getNumber(
        REFERRAL_REWARD_SETTING_KEYS.dailyCap,
        REFERRAL_REWARD_DEFAULTS.dailyCap,
      ),
      this.providerRuntimeConfigService.getNumber(
        REFERRAL_REWARD_SETTING_KEYS.lifetimeCap,
        REFERRAL_REWARD_DEFAULTS.lifetimeCap,
      ),
    ]);

    const byType = new Map(
      rewards.map((reward) => [reward.rewardType as RewardTypeEnum, reward]),
    );
    const rule = (
      type: RewardTypeEnum,
      direction: 'earn' | 'spend',
    ): EconomyRuleResponse => {
      const reward = byType.get(type);
      return {
        points: reward?.points ?? RULE_FALLBACKS[type] ?? 0,
        direction,
        rewardType: type,
        daily: Boolean(reward?.isDaily),
        active: reward ? Boolean(reward.isActive) : true,
        description: reward?.description ?? null,
      };
    };

    const referral: EconomyReferralResponse = {
      ...rule(RewardTypeEnum.REFERRAL_REWARD, 'earn'),
      bothSides: true,
      dailyCap,
      lifetimeCap,
      requiresReferredGeneration: true,
    };

    return {
      currency: { code: 'YEP', name: 'Yeps' },
      earn: {
        likeReceived: rule(RewardTypeEnum.LIKE_EARN, 'earn'),
        dailyLogin: rule(RewardTypeEnum.DAILY_LOGIN, 'earn'),
        postPhoto: rule(RewardTypeEnum.POST_PHOTO_REWARD, 'earn'),
        postVideo: rule(RewardTypeEnum.POST_VIDEO_REWARD, 'earn'),
        contestParticipation: rule(
          RewardTypeEnum.CONTEST_PARTICIPATION,
          'earn',
        ),
        rateApp: rule(RewardTypeEnum.RATE_APP, 'earn'),
        sharePost: rule(RewardTypeEnum.SHARE_YEPS, 'earn'),
        registrationBonus: rule(RewardTypeEnum.REGISTRATION_BONUS, 'earn'),
        referral,
      },
      spend: {
        likeGiven: rule(RewardTypeEnum.LIKE_SPEND, 'spend'),
      },
      generation: {
        image: this.pricesFor(aiSettings, 'image_generate'),
        imageEdit: this.pricesFor(aiSettings, 'image_edit'),
        video: this.pricesFor(aiSettings, 'video_generate'),
        meme: this.pricesFor(aiSettings, 'meme_generate'),
        audio: this.pricesFor(aiSettings, 'audio_generate'),
      },
    };
  }

  private pricesFor(
    settings: MediaAISettingsEntity[],
    capability: string,
  ): EconomyGenerationPriceResponse[] {
    return settings
      .filter((setting) => setting.capability === capability)
      .map((setting) => {
        const pricing = setting.settings?.pricing;
        const perSecond =
          pricing?.strategy === 'per_second' &&
          typeof pricing.creditsPerSecond === 'number'
            ? pricing.creditsPerSecond
            : null;
        const durations = setting.settings?.durations?.filter((value) =>
          Number.isFinite(value),
        );

        return {
          aiService: setting.aiService,
          name: setting.name,
          points: setting.cost,
          strategy: perSecond ? 'per_second' : 'fixed',
          creditsPerSecond: perSecond,
          durationCosts: durations?.length
            ? Object.fromEntries(
                durations.map((duration) => [
                  String(duration),
                  this.pricingService.resolveVideoGenerationCost(
                    setting,
                    duration,
                  ),
                ]),
              )
            : null,
        };
      });
  }
}
