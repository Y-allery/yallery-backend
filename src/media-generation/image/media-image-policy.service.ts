import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as leoProfanity from 'leo-profanity';
import { Repository } from 'typeorm';
import { AISettingsEntity } from 'src/image-generation/entities/ai-settings.entity';
import { GenerateMediaImageDto } from './dto/generate-media-image.dto';
import {
  MEDIA_IMAGE_DEFAULT_ORIENTATION,
  MEDIA_IMAGE_POLICY_AI_SERVICE,
} from './media-image.constants';

@Injectable()
export class MediaImagePolicyService {
  constructor(
    @InjectRepository(AISettingsEntity)
    private readonly aiSettingsRepository: Repository<AISettingsEntity>,
  ) {}

  async prepareDto(dto: GenerateMediaImageDto): Promise<GenerateMediaImageDto> {
    const settings = await this.getSettingsOrThrow();
    const prompt = this.sanitizePrompt(dto.prompt);
    const orientation = dto.orientation ?? MEDIA_IMAGE_DEFAULT_ORIENTATION;
    const imageQuantity = dto.imageQuantity ?? settings.minImages;

    if (prompt.length > settings.maxPromptLength) {
      throw new BadRequestException(
        `Prompt length must not exceed ${settings.maxPromptLength} characters for ${settings.name}`,
      );
    }

    if (imageQuantity < settings.minImages || imageQuantity > settings.maxImages) {
      throw new BadRequestException(
        `Image quantity must be between ${settings.minImages} and ${settings.maxImages} for ${settings.name}`,
      );
    }

    if (!settings.allowedOrientations.includes(orientation)) {
      throw new BadRequestException(
        `Orientation ${orientation} is not allowed for ${settings.name}. Allowed: ${settings.allowedOrientations.join(', ')}`,
      );
    }

    return {
      ...dto,
      prompt,
      context: this.normalizeOptionalText(dto.context, settings.maxPromptLength),
      negativePrompt: this.normalizeOptionalText(
        dto.negativePrompt,
        settings.maxPromptLength,
      ),
      orientation,
      imageQuantity,
    };
  }

  async getGenerationCost(quantity: number): Promise<number> {
    const settings = await this.getSettingsOrThrow();
    return settings.cost * quantity;
  }

  async getSettingsOrThrow(): Promise<AISettingsEntity> {
    const settings = await this.aiSettingsRepository.findOne({
      where: {
        aiService: MEDIA_IMAGE_POLICY_AI_SERVICE,
        isActive: true,
        type: 'image',
      },
    });

    if (!settings) {
      throw new BadRequestException(
        `AI service ${MEDIA_IMAGE_POLICY_AI_SERVICE} not found in ai_settings or is inactive`,
      );
    }

    return settings;
  }

  sanitizePrompt(prompt: string): string {
    const trimmedPrompt = prompt?.trim() || '';
    if (!trimmedPrompt) {
      return trimmedPrompt;
    }

    if (leoProfanity.check(trimmedPrompt)) {
      return 'Create a neutral and appropriate image.';
    }

    return trimmedPrompt;
  }

  private normalizeOptionalText(
    value: string | undefined,
    maxLength: number,
  ): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    return trimmed.slice(0, maxLength);
  }
}
