import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ColorEntity } from 'src/image-generation/entities/color.entity';
import { AISettingsEntity } from 'src/image-generation/entities/ai-settings.entity';
import { StyleEntity } from 'src/post/entities/style.entity';
import {
  MEDIA_IMAGE_DEFAULT_DIMENSIONS,
  MEDIA_IMAGE_DEFAULT_ORIENTATION,
  MEDIA_IMAGE_POLICY_AI_SERVICE,
} from './media-image.constants';

@Injectable()
export class MediaImageSettingsService {
  constructor(
    @InjectRepository(AISettingsEntity)
    private readonly aiSettingsRepository: Repository<AISettingsEntity>,
    @InjectRepository(ColorEntity)
    private readonly colorRepository: Repository<ColorEntity>,
    @InjectRepository(StyleEntity)
    private readonly styleRepository: Repository<StyleEntity>,
  ) {}

  async getStandardImageSettings(): Promise<Record<string, unknown>> {
    const [setting, colors, styles] = await Promise.all([
      this.aiSettingsRepository.findOne({
        where: {
          aiService: MEDIA_IMAGE_POLICY_AI_SERVICE,
          isActive: true,
          type: 'image',
        },
      }),
      this.colorRepository.find(),
      this.styleRepository.find({
        select: { id: true, name: true, imageUrl: true },
      }),
    ]);

    if (!setting) {
      throw new Error(
        `AI service ${MEDIA_IMAGE_POLICY_AI_SERVICE} not found or inactive`,
      );
    }

    const defaultStyle = styles.find((style) => style.id === 12)?.id ?? styles[0]?.id ?? null;
    const defaultColor = colors.find((color) => color.id === 1)?.id ?? colors[0]?.id ?? null;
    const defaultSize = `${MEDIA_IMAGE_DEFAULT_DIMENSIONS[MEDIA_IMAGE_DEFAULT_ORIENTATION].width}x${MEDIA_IMAGE_DEFAULT_DIMENSIONS[MEDIA_IMAGE_DEFAULT_ORIENTATION].height}`;

    return {
      defaultSettings: {
        defaultAI: MEDIA_IMAGE_POLICY_AI_SERVICE,
        defaultStyle,
        defaultSize,
        defaultOrientations: MEDIA_IMAGE_DEFAULT_ORIENTATION,
        defaultColor,
      },
      aiSettings: [
        {
          id: setting.aiService,
          aiService: setting.aiService,
          name: setting.name,
          allowedOrientations: setting.allowedOrientations,
          minImages: setting.minImages,
          maxImages: setting.maxImages,
          maxPromptLength: setting.maxPromptLength,
          sizes: setting.sizes || [],
          qualityOptions: setting.qualityOptions || [],
          styles: setting.styles || [],
          isArtem: setting.isArtem,
          cost: setting.cost,
          description: setting.description,
          modelType: 'TEXT_TO_IMAGE',
        },
      ],
      colors: colors.map((color) => ({
        id: color.id,
        name: color.name,
      })),
      styles: styles.map((style) => ({
        id: style.id,
        name: style.name,
        imageUrl: style.imageUrl,
      })),
      aiDescription: setting.description ? [`${setting.name}: ${setting.description}`] : [],
    };
  }
}
