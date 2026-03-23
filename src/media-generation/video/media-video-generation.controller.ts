import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';
import { EnqueueMediaVideoResponseDto } from './dto/enqueue-media-video-response.dto';
import { GenerateMediaVideoDto } from './dto/generate-media-video.dto';
import { MediaVideoGenerationService } from './media-video-generation.service';
import { MediaVideoSettingsService } from './media-video-settings.service';

@ApiTags('Media Generation')
@Controller('media-generation/video')
@UseGuards(JwtAuthGuard)
export class MediaVideoGenerationController {
  constructor(
    private readonly mediaVideoGenerationService: MediaVideoGenerationService,
    private readonly mediaVideoSettingsService: MediaVideoSettingsService,
  ) {}

  @Get('ai-settings')
  @ApiOperation({
    summary: 'Get standardized AI settings for the new video generation flow',
  })
  @ApiResponse({
    status: 200,
    description: 'Standard video generation settings.',
  })
  async getAiSettings(): Promise<Record<string, unknown>> {
    return this.mediaVideoSettingsService.getStandardVideoSettings();
  }

  @Post('generate')
  @ApiOperation({
    summary: 'Queue video generation through the new isolated media-generation layer',
  })
  @ApiBody({ type: GenerateMediaVideoDto })
  @ApiResponse({
    status: 202,
    description: 'Video generation task added to backend queue.',
    type: EnqueueMediaVideoResponseDto,
  })
  @HttpCode(HttpStatus.ACCEPTED)
  async generate(
    @Body() dto: GenerateMediaVideoDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<EnqueueMediaVideoResponseDto> {
    const result = await this.mediaVideoGenerationService.enqueue(
      dto,
      req.user.id,
    );

    return {
      success: true,
      message: 'Video generation task has been added to the queue.',
      requestId: result.requestId,
      status: result.status,
    };
  }
}
