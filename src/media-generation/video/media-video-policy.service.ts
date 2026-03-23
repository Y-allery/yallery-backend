import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContestEntity } from 'src/contest/entity/contest.entity';
import { AISettingsEntity } from 'src/image-generation/entities/ai-settings.entity';
import { VideoAIEnum } from 'src/common/enums/ai.enum';
import { GenerateMediaVideoDto } from './dto/generate-media-video.dto';
import {
  MEDIA_VIDEO_ALLOWED_DURATIONS,
  MEDIA_VIDEO_DEFAULT_DURATION,
} from './media-video.constants';

@Injectable()
export class MediaVideoPolicyService {
  constructor(
    @InjectRepository(AISettingsEntity)
    private readonly aiSettingsRepository: Repository<AISettingsEntity>,
    @InjectRepository(ContestEntity)
    private readonly contestRepository: Repository<ContestEntity>,
  ) {}

  async prepareDto(dto: GenerateMediaVideoDto): Promise<GenerateMediaVideoDto> {
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

    const duration = dto.duration ?? MEDIA_VIDEO_DEFAULT_DURATION;
    if (!MEDIA_VIDEO_ALLOWED_DURATIONS.includes(duration)) {
      throw new BadRequestException(
        `duration must be one of: ${MEDIA_VIDEO_ALLOWED_DURATIONS.join(', ')}`,
      );
    }

    const imageUrl = dto.imageUrl?.trim() || null;
    if (dto.aiService === VideoAIEnum.BYTY_DANCE && !imageUrl) {
      throw new BadRequestException(
        'imageUrl is required for the selected image-to-video model',
      );
    }

    return {
      ...dto,
      prompt,
      aiService: dto.aiService.trim(),
      imageUrl,
      duration,
      contestId: dto.contestId ?? null,
    };
  }

  async getGenerationCost(aiService: string): Promise<number> {
    const aiSetting = await this.getAISettingOrThrow(aiService);
    return aiSetting.cost;
  }

  async getAISettingOrThrow(aiService: string): Promise<AISettingsEntity> {
    const aiSetting = await this.aiSettingsRepository.findOne({
      where: { aiService, type: 'video', isActive: true },
    });

    if (!aiSetting) {
      throw new BadRequestException(
        `AI service ${aiService} not found in ai_settings or is inactive`,
      );
    }

    return aiSetting;
  }
}
