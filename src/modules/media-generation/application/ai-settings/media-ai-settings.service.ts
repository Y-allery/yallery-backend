import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ColorEntity } from 'src/modules/media-generation/persistence/entities/color.entity';
import { MediaAISettingsEntity } from 'src/modules/media-generation/persistence/entities/media-ai-settings.entity';
import { StyleEntity } from 'src/modules/posts/entities/style.entity';
import { AudioAISettingsResponse } from 'src/modules/media-generation/api/contracts/audio-ai-settings-response.contract';
import { EditImageAISettingsResponse } from 'src/modules/media-generation/api/contracts/edit-image-ai-settings-response.contract';
import { MemeAISettingsResponse } from 'src/modules/media-generation/api/contracts/meme-ai-settings-response.contract';
import { PromptImageAISettingsResponse } from 'src/modules/media-generation/api/contracts/prompt-image-ai-settings-response.contract';
import { VideoAISettingsResponse } from 'src/modules/media-generation/api/contracts/video-ai-settings-response.contract';
import { audioGenerateCapability } from 'src/modules/media-generation/domain/capabilities/audio/audio-generate.capability';
import { imageEditCapability } from 'src/modules/media-generation/domain/capabilities/image/image-edit.capability';
import { imageGenerateCapability } from 'src/modules/media-generation/domain/capabilities/image/image-generate.capability';
import { memeGenerateCapability } from 'src/modules/media-generation/domain/capabilities/meme/meme-generate.capability';
import { videoGenerateCapability } from 'src/modules/media-generation/domain/capabilities/video/video-generate.capability';
import {
  getPromptImageAllowedOrientations,
  getPromptImageDefaultOrientation,
} from 'src/modules/media-generation/domain/presets';
import { MediaRouteResolverService } from 'src/modules/media-generation/infrastructure/routing/media-route-resolver.service';
import { MediaGenerationPricingService } from 'src/modules/media-generation/application/pricing/media-generation-pricing.service';

@Injectable()
export class MediaAISettingsService {
  private getImageLimitSettings(setting: MediaAISettingsEntity) {
    return {
      minImages: setting.settings?.minImages ?? 1,
      maxImages: setting.settings?.maxImages ?? 4,
      maxPromptLength: setting.settings?.maxPromptLength ?? null,
    };
  }

  constructor(
    private readonly mediaRouteResolverService: MediaRouteResolverService,
    private readonly mediaGenerationPricingService: MediaGenerationPricingService,
    @InjectRepository(MediaAISettingsEntity)
    private readonly mediaAISettingsRepository: Repository<MediaAISettingsEntity>,
    @InjectRepository(ColorEntity)
    private readonly colorRepository: Repository<ColorEntity>,
    @InjectRepository(StyleEntity)
    private readonly styleRepository: Repository<StyleEntity>,
  ) {}

  async getPromptImageAISettings(): Promise<PromptImageAISettingsResponse> {
    const [settings, colors, styles] = await Promise.all([
      this.mediaAISettingsRepository.find({
        where: {
          capability: 'image_generate',
          aiService: In(['flux2_klein', 'sdxl']),
          isActive: true,
        },
        order: {
          id: 'ASC',
        },
      }),
      this.getColors(),
      this.getStyles(),
    ]);

    const visibleSettings = settings.filter(
      (setting) => setting.settings?.contestOnly !== true,
    );

    const defaultSetting = visibleSettings.find(
      (setting) => setting.aiService === 'flux2_klein',
    );

    return {
      defaultSettings: {
        defaultAI: defaultSetting?.aiService ?? null,
        defaultOrientations: defaultSetting
          ? getPromptImageDefaultOrientation(defaultSetting.aiService)
          : 'vertical',
      },
      aiSettings: visibleSettings.map((setting) => ({
        aiService: setting.aiService,
        name: setting.name,
        allowedOrientations: getPromptImageAllowedOrientations(
          setting.aiService,
        ),
        ...this.getImageLimitSettings(setting),
        cost: setting.cost,
        description: setting.description,
      })),
      colors: colors.map((color) => ({
        id: color.id,
        name: color.name,
      })),
      styles: styles.map((style) => ({
        id: style.id,
        name: style.name,
        imageUrl: style.imageUrl,
      })),
    };
  }

  async getEditImageAISettings(): Promise<EditImageAISettingsResponse> {
    const [settings, colors, styles] = await Promise.all([
      this.mediaAISettingsRepository.find({
        where: {
          capability: 'image_edit',
          aiService: 'qwen_image_edit_baked',
          isActive: true,
        },
        order: {
          id: 'ASC',
        },
      }),
      this.getColors(),
      this.getStyles(),
    ]);

    const defaultSetting = settings.find(
      (setting) => setting.aiService === 'qwen_image_edit_baked',
    );

    return {
      defaultSettings: {
        defaultAI: defaultSetting?.aiService ?? null,
      },
      aiSettings: settings.map((setting) => ({
        aiService: setting.aiService,
        name: setting.name,
        ...this.getImageLimitSettings(setting),
        cost: setting.cost,
        description: setting.description,
      })),
      colors: colors.map((color) => ({
        id: color.id,
        name: color.name,
      })),
      styles: styles.map((style) => ({
        id: style.id,
        name: style.name,
        imageUrl: style.imageUrl,
      })),
    };
  }

  async getAudioAISettings(): Promise<AudioAISettingsResponse> {
    const settings = await this.mediaAISettingsRepository.find({
      where: {
        capability: 'audio_generate',
        isActive: true,
      },
      order: {
        id: 'ASC',
      },
    });

    const defaultSetting =
      settings.find((setting) => setting.aiService === 'mmaudio_v2') ??
      settings[0];

    return {
      defaultSettings: {
        defaultAI: defaultSetting?.aiService ?? null,
      },
      aiSettings: settings.map((setting) => ({
        aiService: setting.aiService,
        name: setting.name,
        cost: setting.cost,
        description: setting.description,
      })),
    };
  }

  async getTextVideoAISettings(): Promise<VideoAISettingsResponse> {
    const settings = await this.mediaAISettingsRepository.find({
      where: {
        capability: 'video_generate',
        aiService: 'p_video_text',
        isActive: true,
      },
      order: {
        id: 'ASC',
      },
    });

    const defaultSetting = settings[0];

    return {
      defaultSettings: {
        defaultAI: defaultSetting?.aiService ?? null,
      },
      aiSettings: settings.map((setting) => ({
        aiService: setting.aiService,
        name: setting.name,
        cost:
          this.mediaGenerationPricingService.resolveVideoGenerationCost(
            setting,
          ),
        description: setting.description,
        settings:
          this.mediaGenerationPricingService.buildVideoAISettingsPayload(
            setting,
          ),
      })),
    };
  }

  async getImageVideoAISettings(): Promise<VideoAISettingsResponse> {
    const settings = await this.mediaAISettingsRepository.find({
      where: {
        capability: 'video_generate',
        aiService: 'p_video_image',
        isActive: true,
      },
      order: {
        id: 'ASC',
      },
    });

    const defaultSetting = settings[0];

    return {
      defaultSettings: {
        defaultAI: defaultSetting?.aiService ?? null,
      },
      aiSettings: settings.map((setting) => ({
        aiService: setting.aiService,
        name: setting.name,
        cost:
          this.mediaGenerationPricingService.resolveVideoGenerationCost(
            setting,
          ),
        description: setting.description,
        settings:
          this.mediaGenerationPricingService.buildVideoAISettingsPayload(
            setting,
          ),
      })),
    };
  }

  async getMemeAISettings(): Promise<MemeAISettingsResponse> {
    const settings = await this.mediaAISettingsRepository.find({
      where: {
        capability: 'meme_generate',
        isActive: true,
      },
      order: {
        id: 'ASC',
      },
    });

    const defaultSetting =
      settings.find(
        (setting) => setting.aiService === 'wan22_animate_native',
      ) ?? settings[0];

    return {
      defaultSettings: {
        defaultAI: defaultSetting?.aiService ?? null,
      },
      aiSettings: settings.map((setting) => ({
        aiService: setting.aiService,
        name: setting.name,
        cost: setting.cost,
        description: setting.description,
        settings: setting.settings
          ? {
              characterOrientations: setting.settings.characterOrientations,
              defaultCharacterOrientation:
                setting.settings.defaultCharacterOrientation,
              keepOriginalSound: setting.settings.keepOriginalSound,
              matchSourceDuration: setting.settings.matchSourceDuration,
              outputFrameRate: setting.settings.outputFrameRate,
              pricing: setting.settings.pricing
                ? {
                    strategy:
                      setting.settings.pricing.strategy === 'per_second'
                        ? 'per_second'
                        : 'fixed',
                    creditsPerSecond:
                      setting.settings.pricing.creditsPerSecond,
                  }
                : undefined,
            }
          : null,
      })),
    };
  }

  async resolveVideoDuration(
    aiService: string,
    requestedDuration?: number,
  ): Promise<number> {
    const setting = await this.mediaAISettingsRepository.findOne({
      where: {
        aiService,
        capability: 'video_generate',
        isActive: true,
      },
    });

    if (!setting) {
      throw new NotFoundException(`Video model ${aiService} not found`);
    }

    const supportedDurations = setting.settings?.durations?.filter((value) =>
      Number.isFinite(value),
    );

    if (!supportedDurations?.length) {
      return requestedDuration ?? 5;
    }

    if (requestedDuration == null) {
      return supportedDurations[0];
    }

    if (!supportedDurations.includes(requestedDuration)) {
      throw new BadRequestException(
        `Unsupported duration for ${aiService}. Supported values: ${supportedDurations.join(', ')}`,
      );
    }

    return requestedDuration;
  }

  getCapabilities() {
    return {
      capabilities: [
        imageGenerateCapability,
        imageEditCapability,
        audioGenerateCapability,
        videoGenerateCapability,
        memeGenerateCapability,
      ],
      routes: this.mediaRouteResolverService.describeRoutes(),
    };
  }

  private getColors() {
    return this.colorRepository.find({
      select: {
        id: true,
        name: true,
      },
      order: {
        id: 'ASC',
      },
    });
  }

  private getStyles() {
    return this.styleRepository.find({
      select: {
        id: true,
        name: true,
        imageUrl: true,
      },
      order: {
        id: 'ASC',
      },
    });
  }
}
