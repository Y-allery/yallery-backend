import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AISettingsEntity } from 'src/image-generation/entities/ai-settings.entity';

@Injectable()
export class AudioGenerationService {
  constructor(
    @InjectRepository(AISettingsEntity)
    private readonly aiSettingsRepository: Repository<AISettingsEntity>,
  ) {}

  async getAllAISettings() {
    const audioSettingsFromDb = await this.aiSettingsRepository.find({
      where: {
        type: 'audio',
        isActive: true,
      },
      order: { id: 'ASC' },
    });

    if (audioSettingsFromDb.length === 0) {
      return {
        defaultSettings: {
          defaultAI: null,
          cost: 0,
        },
        aiSettings: [],
      };
    }

    const defaultSettings = {
      defaultAI: audioSettingsFromDb[0].aiService,
      cost: audioSettingsFromDb[0].cost,
    };

    const aiSettings = audioSettingsFromDb.map((setting) => ({
      id: setting.aiService,
      name: setting.name,
      cost: setting.cost,
      description: setting.description,
      api_model: setting.apiModel,
    }));

    return {
      defaultSettings,
      aiSettings,
    };
  }
}

