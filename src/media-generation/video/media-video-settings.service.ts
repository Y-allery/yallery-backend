import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AISettingsEntity } from 'src/image-generation/entities/ai-settings.entity';
import { VideoAIEnum } from 'src/common/enums/ai.enum';
import { MEDIA_VIDEO_ALLOWED_DURATIONS } from './media-video.constants';

@Injectable()
export class MediaVideoSettingsService {
  constructor(
    @InjectRepository(AISettingsEntity)
    private readonly aiSettingsRepository: Repository<AISettingsEntity>,
  ) {}

  async getStandardVideoSettings(): Promise<Record<string, unknown>> {
    const videoSettings = await this.aiSettingsRepository.find({
      where: { type: 'video', isActive: true },
      order: { id: 'ASC' },
    });

    if (videoSettings.length === 0) {
      return {
        defaultSettings: {
          defaultAI: null,
          cost: 0,
        },
        aiSettings: [],
      };
    }

    const defaultAi =
      videoSettings.find((setting) => setting.aiService === VideoAIEnum.BYTY_DANCE)
        ?.aiService ?? videoSettings[0].aiService;
    const defaultSetting =
      videoSettings.find((setting) => setting.aiService === defaultAi) ??
      videoSettings[0];

    return {
      defaultSettings: {
        defaultAI: defaultAi,
        cost: defaultSetting.cost,
      },
      aiSettings: videoSettings.map((setting) => ({
        id: setting.aiService,
        name: setting.name,
        cost: setting.cost,
        description: setting.description,
        apiModel: setting.apiModel,
        maxPromptLength: setting.maxPromptLength,
        supportedInputs: this.getSupportedInputs(setting.aiService),
        durations: MEDIA_VIDEO_ALLOWED_DURATIONS,
      })),
    };
  }

  private getSupportedInputs(aiService: string): string[] {
    if (aiService === VideoAIEnum.BYTY_DANCE) {
      return ['TEXT_PROMPT', 'IMAGE_SOURCE'];
    }

    if (aiService === VideoAIEnum.KLING_TEXT_TO_VIDEO) {
      return ['TEXT_PROMPT'];
    }

    return ['TEXT_PROMPT'];
  }
}
