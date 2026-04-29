import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VideoAISettingsResponse } from 'src/modules/media-generation/api/contracts/video-ai-settings-response.contract';
import { MediaAISettingsEntity } from 'src/modules/media-generation/persistence/entities/media-ai-settings.entity';

@Injectable()
export class MediaGenerationPricingService {
  constructor(
    @InjectRepository(MediaAISettingsEntity)
    private readonly mediaAISettingsRepository: Repository<MediaAISettingsEntity>,
  ) {}

  async getPromptImageCost(
    aiService: string,
    imageQuantity: number,
  ): Promise<number> {
    const aiSetting = await this.mediaAISettingsRepository.findOne({
      where: {
        aiService,
        capability: 'image_generate',
        isActive: true,
      },
    });

    if (!aiSetting) {
      throw new BadRequestException(
        `Media AI settings not found for prompt image service ${aiService}`,
      );
    }

    return aiSetting.cost * imageQuantity;
  }

  async getImageEditCost(aiService: string): Promise<number> {
    const aiSetting = await this.mediaAISettingsRepository.findOne({
      where: {
        aiService,
        capability: 'image_edit',
        isActive: true,
      },
    });

    if (!aiSetting) {
      throw new BadRequestException(
        `Media AI settings not found for image edit service ${aiService}`,
      );
    }

    return aiSetting.cost;
  }

  async getAudioCost(aiService: string): Promise<number> {
    const aiSetting = await this.mediaAISettingsRepository.findOne({
      where: {
        aiService,
        capability: 'audio_generate',
        isActive: true,
      },
    });

    if (!aiSetting) {
      throw new BadRequestException(
        `Media AI settings not found for audio service ${aiService}`,
      );
    }

    return aiSetting.cost;
  }

  async getVideoCost(
    aiService: string,
    duration?: number,
  ): Promise<number> {
    const aiSetting = await this.mediaAISettingsRepository.findOne({
      where: {
        aiService,
        capability: 'video_generate',
        isActive: true,
      },
    });

    if (!aiSetting) {
      throw new BadRequestException(
        `Media AI settings not found for video service ${aiService}`,
      );
    }

    return this.resolveVideoGenerationCost(aiSetting, duration);
  }

  async getMemeCost(
    aiService: string,
    durationSeconds?: number | null,
  ): Promise<number> {
    const aiSetting = await this.mediaAISettingsRepository.findOne({
      where: {
        aiService,
        capability: 'meme_generate',
        isActive: true,
      },
    });

    if (!aiSetting) {
      throw new BadRequestException(
        `Media AI settings not found for meme service ${aiService}`,
      );
    }

    const pricing = aiSetting.settings?.pricing;
    const billableDurationSeconds =
      typeof durationSeconds === 'number' &&
      Number.isFinite(durationSeconds) &&
      durationSeconds > 0
        ? Math.ceil(durationSeconds)
        : null;

    if (
      pricing?.strategy === 'per_second' &&
      typeof pricing.creditsPerSecond === 'number' &&
      pricing.creditsPerSecond > 0 &&
      billableDurationSeconds
    ) {
      return Math.ceil(pricing.creditsPerSecond * billableDurationSeconds);
    }

    return aiSetting.cost;
  }

  buildVideoAISettingsPayload(
    aiSetting: MediaAISettingsEntity,
  ): VideoAISettingsResponse['aiSettings'][number]['settings'] {
    if (!aiSetting.settings) {
      return null;
    }

    const durations = aiSetting.settings.durations?.filter((value) =>
      Number.isFinite(value),
    );
    const pricing = aiSetting.settings.pricing;

    return {
      durations,
      pricing: pricing
        ? {
            strategy: pricing.strategy === 'per_second' ? 'per_second' : 'fixed',
            creditsPerSecond: pricing.creditsPerSecond,
            durationCosts:
              durations?.map((duration) => ({
                duration,
                cost: this.resolveVideoGenerationCost(aiSetting, duration),
              })) ?? [],
          }
        : undefined,
    };
  }

  resolveVideoGenerationCost(
    aiSetting: MediaAISettingsEntity,
    duration?: number,
  ): number {
    const supportedDurations = aiSetting.settings?.durations?.filter((value) =>
      Number.isFinite(value),
    );
    const effectiveDuration =
      duration ??
      (supportedDurations?.[0] && Number.isFinite(supportedDurations[0])
        ? supportedDurations[0]
        : undefined);
    const pricing = aiSetting.settings?.pricing;

    if (
      pricing?.strategy === 'per_second' &&
      typeof pricing.creditsPerSecond === 'number' &&
      pricing.creditsPerSecond > 0 &&
      typeof effectiveDuration === 'number' &&
      Number.isFinite(effectiveDuration)
    ) {
      return Math.ceil(pricing.creditsPerSecond * effectiveDuration);
    }

    return aiSetting.cost;
  }
}
