import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt.auth.guard';
import { AuthenticatedRequest } from 'src/modules/auth/types/auth.user.interface';
import { MEDIA_GENERATION_SWAGGER } from 'src/shared/swagger';
import { GenerateAudioDto } from 'src/modules/media-generation/api/dto/generate-audio.dto';
import { GenerateEditImageDto } from 'src/modules/media-generation/api/dto/generate-edit-image.dto';
import { GenerateImageVideoDto } from 'src/modules/media-generation/api/dto/generate-image-video.dto';
import { GenerateMemeDto } from 'src/modules/media-generation/api/dto/generate-meme.dto';
import { GeneratePromptImageDto } from 'src/modules/media-generation/api/dto/generate-prompt-image.dto';
import { GenerateTextVideoDto } from 'src/modules/media-generation/api/dto/generate-text-video.dto';
import {
  MediaOrientation,
  resolveVideoOrientation,
} from 'src/modules/media-generation/domain/presets';
import { MediaAISettingsService } from 'src/modules/media-generation/application/ai-settings/media-ai-settings.service';
import { ContentTranslationService } from 'src/modules/translations/content-translation.service';
import { RequestLocale } from 'src/modules/translations/request-locale.decorator';
import {
  SupportedLocale,
  TRANSLATABLE_FIELDS,
} from 'src/modules/translations/translation.catalog';
import { MediaGenerationEnqueueService } from 'src/modules/media-generation/application/enqueue/media-generation-enqueue.service';

@ApiTags('Media Generation')
@Controller('media-generation')
@UseGuards(JwtAuthGuard)
export class MediaGenerationController {
  constructor(
    private readonly mediaAISettingsService: MediaAISettingsService,
    private readonly mediaGenerationEnqueueService: MediaGenerationEnqueueService,
    private readonly contentTranslationService: ContentTranslationService,
  ) {}

  /** Localizes style and color names inside an ai-settings response, when present. */
  private async localizeStyles<
    T extends { styles?: { id: number }[]; colors?: { id: number }[] },
  >(response: T, locale: SupportedLocale | null): Promise<T> {
    if (!locale || (!response?.styles?.length && !response?.colors?.length)) {
      return response;
    }
    const [styles, colors] = await Promise.all([
      response.styles?.length
        ? this.contentTranslationService.resolveMany(
            'style',
            locale,
            response.styles,
            TRANSLATABLE_FIELDS.style,
          )
        : Promise.resolve(response.styles),
      response.colors?.length
        ? this.contentTranslationService.resolveMany(
            'color',
            locale,
            response.colors,
            TRANSLATABLE_FIELDS.color,
          )
        : Promise.resolve(response.colors),
    ]);
    return { ...response, styles, colors };
  }

  @Get('image/prompt/ai-settings')
  @ApiOperation(MEDIA_GENERATION_SWAGGER.getPromptImageAISettings)
  @ApiResponse(
    MEDIA_GENERATION_SWAGGER.getPromptImageAISettings.responses.success,
  )
  @ApiResponse(
    MEDIA_GENERATION_SWAGGER.getPromptImageAISettings.responses.unauthorized,
  )
  async getPromptImageAISettings(
    @RequestLocale() locale: SupportedLocale | null,
  ) {
    const response =
      await this.mediaAISettingsService.getPromptImageAISettings();
    return this.localizeStyles(response, locale);
  }

  @Get('image/finetune/ai-settings')
  @ApiOperation(MEDIA_GENERATION_SWAGGER.getFineTunePromptImageAISettings)
  @ApiResponse(
    MEDIA_GENERATION_SWAGGER.getFineTunePromptImageAISettings.responses.success,
  )
  @ApiResponse(
    MEDIA_GENERATION_SWAGGER.getFineTunePromptImageAISettings.responses
      .unauthorized,
  )
  async getFineTunePromptImageAISettings(
    @RequestLocale() locale: SupportedLocale | null,
  ) {
    const response =
      await this.mediaAISettingsService.getFineTunePromptImageAISettings();
    return this.localizeStyles(response, locale);
  }

  @Get('image/edit/ai-settings')
  @ApiOperation(MEDIA_GENERATION_SWAGGER.getEditImageAISettings)
  @ApiResponse(
    MEDIA_GENERATION_SWAGGER.getEditImageAISettings.responses.success,
  )
  @ApiResponse(
    MEDIA_GENERATION_SWAGGER.getEditImageAISettings.responses.unauthorized,
  )
  async getEditImageAISettings(
    @RequestLocale() locale: SupportedLocale | null,
  ) {
    const response = await this.mediaAISettingsService.getEditImageAISettings();
    return this.localizeStyles(response, locale);
  }

  @Get('audio/ai-settings')
  @ApiOperation(MEDIA_GENERATION_SWAGGER.getAudioAISettings)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.getAudioAISettings.responses.success)
  @ApiResponse(
    MEDIA_GENERATION_SWAGGER.getAudioAISettings.responses.unauthorized,
  )
  getAudioAISettings() {
    return this.mediaAISettingsService.getAudioAISettings();
  }

  @Get('video/text/ai-settings')
  @ApiOperation(MEDIA_GENERATION_SWAGGER.getTextVideoAISettings)
  @ApiResponse(
    MEDIA_GENERATION_SWAGGER.getTextVideoAISettings.responses.success,
  )
  @ApiResponse(
    MEDIA_GENERATION_SWAGGER.getTextVideoAISettings.responses.unauthorized,
  )
  getTextVideoAISettings() {
    return this.mediaAISettingsService.getTextVideoAISettings();
  }

  @Get('video/image/ai-settings')
  @ApiOperation(MEDIA_GENERATION_SWAGGER.getImageVideoAISettings)
  @ApiResponse(
    MEDIA_GENERATION_SWAGGER.getImageVideoAISettings.responses.success,
  )
  @ApiResponse(
    MEDIA_GENERATION_SWAGGER.getImageVideoAISettings.responses.unauthorized,
  )
  getImageVideoAISettings() {
    return this.mediaAISettingsService.getImageVideoAISettings();
  }

  @Get('meme/ai-settings')
  @ApiOperation(MEDIA_GENERATION_SWAGGER.getMemeAISettings)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.getMemeAISettings.responses.success)
  @ApiResponse(
    MEDIA_GENERATION_SWAGGER.getMemeAISettings.responses.unauthorized,
  )
  getMemeAISettings() {
    return this.mediaAISettingsService.getMemeAISettings();
  }

  @Post('image/prompt')
  @ApiOperation(MEDIA_GENERATION_SWAGGER.generatePromptImage)
  @ApiBody({
    type: GeneratePromptImageDto,
    description:
      'Prompt-to-image generation request routed through media-generation.',
  })
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generatePromptImage.responses.success)
  @ApiResponse(
    MEDIA_GENERATION_SWAGGER.generatePromptImage.responses.badRequest,
  )
  @ApiResponse(
    MEDIA_GENERATION_SWAGGER.generatePromptImage.responses.unauthorized,
  )
  @ApiResponse(
    MEDIA_GENERATION_SWAGGER.generatePromptImage.responses.notImplemented,
  )
  async generatePromptImage(
    @Body() dto: GeneratePromptImageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const job =
      await this.mediaGenerationEnqueueService.enqueuePromptImageGeneration(
        {
          aiService: dto.ai_service,
          prompt: dto.prompt,
          imageQuantity: dto.image_quantity,
          orientation: dto.orientation,
          styleId: dto.style_id ?? null,
          colorId: dto.color_id ?? null,
          contestId: dto.contest_id ?? null,
        },
        req.user.id,
      );

    return {
      message: 'Image generation task has been added to the queue.',
      taskId: String(job.id),
    };
  }

  @Post('image/edit')
  @ApiOperation(MEDIA_GENERATION_SWAGGER.generateEditImage)
  @ApiBody({
    type: GenerateEditImageDto,
    description: 'Image edit request routed through media-generation.',
  })
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generateEditImage.responses.success)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generateEditImage.responses.badRequest)
  @ApiResponse(
    MEDIA_GENERATION_SWAGGER.generateEditImage.responses.unauthorized,
  )
  @ApiResponse(
    MEDIA_GENERATION_SWAGGER.generateEditImage.responses.notImplemented,
  )
  async generateEditImage(
    @Body() dto: GenerateEditImageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const job =
      await this.mediaGenerationEnqueueService.enqueueImageEditGeneration(
        {
          aiService: dto.ai_service,
          prompt: dto.prompt,
          imageUrl: dto.image_url,
          contestId: dto.contest_id ?? null,
          styleId: dto.style_id ?? null,
          colorId: dto.color_id ?? null,
        },
        req.user.id,
      );

    return {
      message: 'Image editing task has been added to the queue.',
      taskId: String(job.id),
    };
  }

  @Post('audio/generate')
  @ApiOperation(MEDIA_GENERATION_SWAGGER.generateAudio)
  @ApiBody({
    type: GenerateAudioDto,
    description: 'Audio generation request routed through media-generation.',
  })
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generateAudio.responses.success)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generateAudio.responses.badRequest)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generateAudio.responses.unauthorized)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generateAudio.responses.notImplemented)
  async generateAudio(
    @Body() dto: GenerateAudioDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const job = await this.mediaGenerationEnqueueService.enqueueAudioGeneration(
      {
        aiService: dto.ai_service,
        prompt: dto.prompt,
        videoUrl: dto.video_url,
        contestId: dto.contest_id ?? null,
      },
      req.user.id,
    );

    return {
      message: 'Audio generation task has been added to the queue.',
      taskId: String(job.id),
    };
  }

  @Post('video/text')
  @ApiOperation(MEDIA_GENERATION_SWAGGER.generateTextVideo)
  @ApiBody({
    type: GenerateTextVideoDto,
    description:
      'Text-to-video generation request routed through media-generation.',
  })
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generateTextVideo.responses.success)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generateTextVideo.responses.badRequest)
  @ApiResponse(
    MEDIA_GENERATION_SWAGGER.generateTextVideo.responses.unauthorized,
  )
  @ApiResponse(
    MEDIA_GENERATION_SWAGGER.generateTextVideo.responses.notImplemented,
  )
  async generateTextVideo(
    @Body() dto: GenerateTextVideoDto,
    @Req() req: AuthenticatedRequest,
  ) {
    let orientation: MediaOrientation;
    let duration: number;

    try {
      orientation = resolveVideoOrientation(dto.ai_service, dto.orientation);
      duration = await this.mediaAISettingsService.resolveVideoDuration(
        dto.ai_service,
        dto.duration,
      );
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }

    const job =
      await this.mediaGenerationEnqueueService.enqueueTextVideoGeneration(
        {
          aiService: dto.ai_service,
          prompt: dto.prompt,
          orientation,
          duration,
          contestId: dto.contest_id ?? null,
        },
        req.user.id,
      );

    return {
      message: 'Video generation task has been added to the queue.',
      taskId: String(job.id),
    };
  }

  @Post('video/image')
  @ApiOperation(MEDIA_GENERATION_SWAGGER.generateImageVideo)
  @ApiBody({
    type: GenerateImageVideoDto,
    description:
      'Image-to-video generation request routed through media-generation.',
  })
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generateImageVideo.responses.success)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generateImageVideo.responses.badRequest)
  @ApiResponse(
    MEDIA_GENERATION_SWAGGER.generateImageVideo.responses.unauthorized,
  )
  @ApiResponse(
    MEDIA_GENERATION_SWAGGER.generateImageVideo.responses.notImplemented,
  )
  async generateImageVideo(
    @Body() dto: GenerateImageVideoDto,
    @Req() req: AuthenticatedRequest,
  ) {
    let orientation: MediaOrientation;
    let duration: number;

    try {
      orientation = resolveVideoOrientation(dto.ai_service, dto.orientation);
      duration = await this.mediaAISettingsService.resolveVideoDuration(
        dto.ai_service,
        dto.duration,
      );
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }

    const job =
      await this.mediaGenerationEnqueueService.enqueueImageVideoGeneration(
        {
          aiService: dto.ai_service,
          prompt: dto.prompt,
          imageUrl: dto.image_url,
          orientation,
          duration,
          contestId: dto.contest_id ?? null,
        },
        req.user.id,
      );

    return {
      message: 'Video generation task has been added to the queue.',
      taskId: String(job.id),
    };
  }

  @Post('meme/generate')
  @ApiOperation(MEDIA_GENERATION_SWAGGER.generateMeme)
  @ApiBody({
    type: GenerateMemeDto,
    description: 'Meme generation request routed through media-generation.',
  })
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generateMeme.responses.success)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generateMeme.responses.badRequest)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generateMeme.responses.unauthorized)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generateMeme.responses.notImplemented)
  async generateMeme(
    @Body() dto: GenerateMemeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const job = await this.mediaGenerationEnqueueService.enqueueMemeGeneration(
      {
        aiService: dto.ai_service,
        memeId: dto.meme_id,
        imageUrl: dto.image_url,
        prompt: dto.prompt ?? null,
        negativePrompt: dto.negative_prompt ?? null,
        characterOrientation: dto.character_orientation,
      },
      req.user.id,
    );

    return {
      message: 'Meme generation task has been added to the queue.',
      taskId: String(job.id),
    };
  }

  @Get('capabilities')
  @ApiOperation(MEDIA_GENERATION_SWAGGER.getCapabilities)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.getCapabilities.responses.success)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.getCapabilities.responses.unauthorized)
  async getCapabilities() {
    return this.mediaAISettingsService.getCapabilities();
  }
}
