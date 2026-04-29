import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateAISettingsDto } from 'src/modules/admin/dto/update-ai-settings.dto';
import {
  MediaAISettingsEntity,
  MediaAISettingsJson,
} from 'src/modules/media-generation/persistence/entities/media-ai-settings.entity';
import { AISettingsMapper } from './ai-settings.mapper';

@Injectable()
export class AdminAISettingsService {
  constructor(
    @InjectRepository(MediaAISettingsEntity)
    private readonly mediaAISettingsRepository: Repository<MediaAISettingsEntity>,
    private readonly aiSettingsMapper: AISettingsMapper,
  ) {}

  private resolveUpdatedMediaSettings(
    aiSetting: MediaAISettingsEntity,
    updateDto: UpdateAISettingsDto,
  ): MediaAISettingsJson | null {
    if (updateDto.settings === undefined) {
      return aiSetting.settings;
    }

    if (!['video_generate', 'meme_generate'].includes(aiSetting.capability)) {
      throw new BadRequestException(
        'Structured settings can only be edited for video and meme generation models',
      );
    }

    const nextSettings: MediaAISettingsJson = {
      ...(aiSetting.settings ?? {}),
    };

    if (updateDto.settings.durations !== undefined) {
      const durations = [...new Set(updateDto.settings.durations)].sort(
        (a, b) => a - b,
      );

      if (!durations.length) {
        throw new BadRequestException('At least one video duration is required');
      }

      nextSettings.durations = durations;
    }

    if (updateDto.settings.pricing !== undefined) {
      const strategy = updateDto.settings.pricing.strategy ?? 'fixed';

      if (strategy === 'per_second') {
        const creditsPerSecond = updateDto.settings.pricing.creditsPerSecond;

        if (
          typeof creditsPerSecond !== 'number' ||
          !Number.isFinite(creditsPerSecond) ||
          creditsPerSecond <= 0
        ) {
          throw new BadRequestException(
            'creditsPerSecond is required for per_second pricing',
          );
        }

        nextSettings.pricing = {
          strategy,
          creditsPerSecond,
        };
      } else {
        nextSettings.pricing = {
          strategy: 'fixed',
        };
      }
    }

    return nextSettings;
  }

  async getAllAISettings() {
    const allSettings = await this.mediaAISettingsRepository.find({
      order: {
        capability: 'ASC',
        id: 'ASC',
      },
    });

    const formattedSettings = allSettings.map((setting) =>
      this.aiSettingsMapper.format(setting),
    );

    return {
      image: formattedSettings.filter((s) => s.type === 'image'),
      video: formattedSettings.filter((s) => s.type === 'video'),
      meme: formattedSettings.filter((s) => s.type === 'meme'),
      music: formattedSettings.filter((s) => s.type === 'music'),
      audio: formattedSettings.filter((s) => s.type === 'music'),
      finetune: formattedSettings.filter((s) => s.type === 'finetune'),
      all: formattedSettings,
    };
  }

  async updateAISettings(id: number, updateDto: UpdateAISettingsDto) {
    const aiSetting = await this.mediaAISettingsRepository.findOne({
      where: { id },
    });

    if (!aiSetting) {
      throw new NotFoundException(`AI settings with ID ${id} not found`);
    }

    if (updateDto.ai_service && updateDto.ai_service !== aiSetting.aiService) {
      const existingService = await this.mediaAISettingsRepository.findOne({
        where: {
          aiService: updateDto.ai_service,
          capability: aiSetting.capability,
        },
      });

      if (existingService && existingService.id !== id) {
        throw new BadRequestException(
          `AI service '${updateDto.ai_service}' already exists for ${aiSetting.capability}`,
        );
      }
    }

    if (updateDto.ai_service !== undefined) {
      aiSetting.aiService = updateDto.ai_service;
    }
    if (updateDto.name !== undefined) {
      aiSetting.name = updateDto.name;
    }
    if (updateDto.description !== undefined) {
      aiSetting.description = updateDto.description;
    }
    if (updateDto.cost !== undefined) {
      aiSetting.cost = updateDto.cost;
    }
    if (updateDto.is_active !== undefined || updateDto.isActive !== undefined) {
      aiSetting.isActive = updateDto.is_active ?? updateDto.isActive;
    }
    if (updateDto.settings !== undefined) {
      aiSetting.settings = this.resolveUpdatedMediaSettings(
        aiSetting,
        updateDto,
      );
    }

    const savedSetting = await this.mediaAISettingsRepository.save(aiSetting);

    return this.aiSettingsMapper.format(savedSetting);
  }
}
