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
import { GenerateMediaAudioDto } from './dto/generate-media-audio.dto';
import { EnqueueMediaAudioResponseDto } from './dto/enqueue-media-audio-response.dto';
import { MediaAudioGenerationService } from './media-audio-generation.service';
import { MediaAudioSettingsService } from './media-audio-settings.service';

@ApiTags('Media Generation')
@Controller('media-generation/audio')
@UseGuards(JwtAuthGuard)
export class MediaAudioGenerationController {
  constructor(
    private readonly mediaAudioGenerationService: MediaAudioGenerationService,
    private readonly mediaAudioSettingsService: MediaAudioSettingsService,
  ) {}

  @Get('ai-settings')
  @ApiOperation({
    summary: 'Get standardized AI settings for the new audio generation flow',
  })
  @ApiResponse({
    status: 200,
    description: 'Standard audio generation settings.',
  })
  async getAiSettings(): Promise<Record<string, unknown>> {
    return this.mediaAudioSettingsService.getStandardAudioSettings();
  }

  @Post('generate')
  @ApiOperation({
    summary: 'Queue audio generation through the new isolated media-generation layer',
  })
  @ApiBody({ type: GenerateMediaAudioDto })
  @ApiResponse({
    status: 202,
    description: 'Audio generation task added to backend queue.',
    type: EnqueueMediaAudioResponseDto,
  })
  @HttpCode(HttpStatus.ACCEPTED)
  async generate(
    @Body() dto: GenerateMediaAudioDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<EnqueueMediaAudioResponseDto> {
    const result = await this.mediaAudioGenerationService.enqueue(
      dto,
      req.user.id,
    );

    return {
      success: true,
      message: 'Audio generation task has been added to the queue.',
      requestId: result.requestId,
      status: result.status,
    };
  }
}
