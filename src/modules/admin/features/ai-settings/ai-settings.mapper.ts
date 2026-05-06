import { Injectable } from '@nestjs/common';
import { MediaAISettingsEntity } from 'src/modules/media-generation/persistence/entities/media-ai-settings.entity';

@Injectable()
export class AISettingsMapper {
  getMediaSettingType(setting: MediaAISettingsEntity) {
    if (setting.settings?.contestOnly) {
      return 'finetune';
    }

    if (setting.capability === 'audio_generate') {
      return 'music';
    }

    if (setting.capability === 'meme_generate') {
      return 'meme';
    }

    if (setting.capability === 'video_generate') {
      return 'video';
    }

    return 'image';
  }

  format(setting: MediaAISettingsEntity) {
    const type = this.getMediaSettingType(setting);

    return {
      id: setting.id,
      ai_service: setting.aiService,
      aiService: setting.aiService,
      name: setting.name,
      description: setting.description,
      provider: setting.provider,
      capability: setting.capability,
      cost: setting.cost,
      settings: setting.settings,
      type,
      category: type,
      is_active: setting.isActive,
      isActive: setting.isActive,
      createdAt: setting.createdAt,
      updatedAt: setting.updatedAt,
    };
  }
}
