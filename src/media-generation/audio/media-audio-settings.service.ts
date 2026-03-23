import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AISettingsEntity } from 'src/image-generation/entities/ai-settings.entity';

@Injectable()
export class MediaAudioSettingsService {
  constructor(
    @InjectRepository(AISettingsEntity)
    private readonly aiSettingsRepository: Repository<AISettingsEntity>,
  ) {}

  async getStandardAudioSettings(): Promise<Record<string, unknown>> {
    const audioSettings = await this.aiSettingsRepository.find({
      where: { type: 'audio', isActive: true },
      order: { id: 'ASC' },
    });

    if (audioSettings.length === 0) {
      return {
        defaultSettings: {
          defaultAI: null,
          cost: 0,
        },
        aiSettings: [],
      };
    }

    return {
      defaultSettings: {
        defaultAI: audioSettings[0].aiService,
        cost: audioSettings[0].cost,
      },
      aiSettings: audioSettings.map((setting) => ({
        id: setting.aiService,
        name: setting.name,
        cost: setting.cost,
        description: setting.description,
        apiModel: setting.apiModel,
        maxPromptLength: setting.maxPromptLength,
        supportedInputs: ['VIDEO_SOURCE'],
      })),
    };
  }
}
