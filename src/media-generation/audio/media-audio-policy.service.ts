import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContestEntity } from 'src/contest/entity/contest.entity';
import { AISettingsEntity } from 'src/image-generation/entities/ai-settings.entity';
import { GenerateMediaAudioDto } from './dto/generate-media-audio.dto';
import { MEDIA_AUDIO_DEFAULT_DURATION } from './media-audio.constants';

@Injectable()
export class MediaAudioPolicyService {
  constructor(
    @InjectRepository(AISettingsEntity)
    private readonly aiSettingsRepository: Repository<AISettingsEntity>,
    @InjectRepository(ContestEntity)
    private readonly contestRepository: Repository<ContestEntity>,
  ) {}

  async prepareDto(dto: GenerateMediaAudioDto): Promise<GenerateMediaAudioDto> {
    const aiSetting = await this.getAISettingOrThrow(dto.aiService);

    const prompt = dto.prompt?.trim();
    if (!prompt) {
      throw new BadRequestException('prompt is required');
    }

    if (prompt.length > aiSetting.maxPromptLength) {
      throw new BadRequestException(
        `Prompt length must not exceed ${aiSetting.maxPromptLength} characters for ${aiSetting.name}`,
      );
    }

    if (dto.contestId) {
      const contest = await this.contestRepository.findOne({
        where: { id: dto.contestId },
      });
      if (!contest) {
        throw new NotFoundException('Contest not found');
      }
    }

    return {
      ...dto,
      videoUrl: dto.videoUrl.trim(),
      prompt,
      aiService: dto.aiService.trim(),
      duration: dto.duration ?? MEDIA_AUDIO_DEFAULT_DURATION,
      contestId: dto.contestId ?? null,
    };
  }

  async getGenerationCost(aiService: string): Promise<number> {
    const aiSetting = await this.getAISettingOrThrow(aiService);
    return aiSetting.cost;
  }

  async getAISettingOrThrow(aiService: string): Promise<AISettingsEntity> {
    const aiSetting = await this.aiSettingsRepository.findOne({
      where: { aiService, type: 'audio', isActive: true },
    });

    if (!aiSetting) {
      throw new BadRequestException(
        `AI service ${aiService} not found in ai_settings or is inactive`,
      );
    }

    return aiSetting;
  }
}
