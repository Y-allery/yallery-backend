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
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';
import { MEDIA_GENERATION_SWAGGER } from 'src/common/swagger';
import { GenerateAudioDto } from './dto/generate-audio.dto';
import { GenerateEditImageDto } from './dto/generate-edit-image.dto';
import { GenerateImageVideoDto } from './dto/generate-image-video.dto';
import { GeneratePromptImageDto } from './dto/generate-prompt-image.dto';
import { GenerateTextVideoDto } from './dto/generate-text-video.dto';
import { MediaGenerationService } from './media-generation.service';
import {
  MediaOrientation,
  resolveVideoOrientation,
} from './presets';

@ApiTags('Media Generation')
@Controller('media-generation')
@UseGuards(JwtAuthGuard)
export class MediaGenerationController {
  constructor(private readonly mediaGenerationService: MediaGenerationService) {}

  @Get('image/prompt/ai-settings')
  @ApiOperation(MEDIA_GENERATION_SWAGGER.getPromptImageAISettings)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.getPromptImageAISettings.responses.success)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.getPromptImageAISettings.responses.unauthorized)
  getPromptImageAISettings() {
    return this.mediaGenerationService.getPromptImageAISettings();
  }

  @Get('image/edit/ai-settings')
  @ApiOperation(MEDIA_GENERATION_SWAGGER.getEditImageAISettings)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.getEditImageAISettings.responses.success)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.getEditImageAISettings.responses.unauthorized)
  getEditImageAISettings() {
    return this.mediaGenerationService.getEditImageAISettings();
  }

  @Get('audio/ai-settings')
  @ApiOperation(MEDIA_GENERATION_SWAGGER.getAudioAISettings)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.getAudioAISettings.responses.success)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.getAudioAISettings.responses.unauthorized)
  getAudioAISettings() {
    return this.mediaGenerationService.getAudioAISettings();
  }

  @Get('video/text/ai-settings')
  @ApiOperation(MEDIA_GENERATION_SWAGGER.getTextVideoAISettings)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.getTextVideoAISettings.responses.success)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.getTextVideoAISettings.responses.unauthorized)
  getTextVideoAISettings() {
    return this.mediaGenerationService.getTextVideoAISettings();
  }

  @Get('video/image/ai-settings')
  @ApiOperation(MEDIA_GENERATION_SWAGGER.getImageVideoAISettings)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.getImageVideoAISettings.responses.success)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.getImageVideoAISettings.responses.unauthorized)
  getImageVideoAISettings() {
    return this.mediaGenerationService.getImageVideoAISettings();
  }

  @Post('image/prompt')
  @ApiOperation(MEDIA_GENERATION_SWAGGER.generatePromptImage)
  @ApiBody({
    type: GeneratePromptImageDto,
    description: 'Prompt-to-image generation request routed through media-generation.',
  })
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generatePromptImage.responses.success)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generatePromptImage.responses.badRequest)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generatePromptImage.responses.unauthorized)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generatePromptImage.responses.notImplemented)
  async generatePromptImage(
    @Body() dto: GeneratePromptImageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.mediaGenerationService.enqueuePromptImageGeneration(
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
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generateEditImage.responses.unauthorized)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generateEditImage.responses.notImplemented)
  async generateEditImage(
    @Body() dto: GenerateEditImageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.mediaGenerationService.enqueueImageEditGeneration(
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
    await this.mediaGenerationService.enqueueAudioGeneration(
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
    };
  }

  @Post('video/text')
  @ApiOperation(MEDIA_GENERATION_SWAGGER.generateTextVideo)
  @ApiBody({
    type: GenerateTextVideoDto,
    description: 'Text-to-video generation request routed through media-generation.',
  })
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generateTextVideo.responses.success)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generateTextVideo.responses.badRequest)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generateTextVideo.responses.unauthorized)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generateTextVideo.responses.notImplemented)
  async generateTextVideo(
    @Body() dto: GenerateTextVideoDto,
    @Req() req: AuthenticatedRequest,
  ) {
    let orientation: MediaOrientation;
    let duration: number;

    try {
      orientation = resolveVideoOrientation(dto.ai_service, dto.orientation);
      duration = await this.mediaGenerationService.resolveVideoDuration(
        dto.ai_service,
        dto.duration,
      );
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }

    await this.mediaGenerationService.enqueueTextVideoGeneration(
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
    };
  }

  @Post('video/image')
  @ApiOperation(MEDIA_GENERATION_SWAGGER.generateImageVideo)
  @ApiBody({
    type: GenerateImageVideoDto,
    description: 'Image-to-video generation request routed through media-generation.',
  })
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generateImageVideo.responses.success)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generateImageVideo.responses.badRequest)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generateImageVideo.responses.unauthorized)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.generateImageVideo.responses.notImplemented)
  async generateImageVideo(
    @Body() dto: GenerateImageVideoDto,
    @Req() req: AuthenticatedRequest,
  ) {
    let orientation: MediaOrientation;
    let duration: number;

    try {
      orientation = resolveVideoOrientation(dto.ai_service, dto.orientation);
      duration = await this.mediaGenerationService.resolveVideoDuration(
        dto.ai_service,
        dto.duration,
      );
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }

    await this.mediaGenerationService.enqueueImageVideoGeneration(
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
    };
  }

  @Get('capabilities')
  @ApiOperation(MEDIA_GENERATION_SWAGGER.getCapabilities)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.getCapabilities.responses.success)
  @ApiResponse(MEDIA_GENERATION_SWAGGER.getCapabilities.responses.unauthorized)
  getCapabilities() {
    return this.mediaGenerationService.getCapabilities();
  }
}
