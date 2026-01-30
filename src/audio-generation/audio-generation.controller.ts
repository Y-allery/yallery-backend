import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';
import { GenerateAudioDto } from './dto/generate-audio.dto';
import { AudioGenerationService } from './audio-generation.service';

@ApiTags('Audio Generation')
@Controller('audio-generation')
@UseGuards(JwtAuthGuard)
export class AudioGenerationController {
  constructor(private readonly audioGenerationService: AudioGenerationService) {}

  @Get('ai-settings')
  @ApiOperation({
    summary: 'Get audio AI settings',
    description:
      'Retrieve available audio (video-to-video SFX) AI models and their settings (cost, description, api_model).',
  })
  @ApiResponse({
    status: 200,
    description: 'Audio AI settings retrieved successfully',
  })
  getAllAISettings() {
    return this.audioGenerationService.getAllAISettings();
  }

  @Post('generate')
  @ApiOperation({
    summary: 'Generate audio for video',
    description:
      'Adds a job to the audio generation queue. Takes an input video_url and returns a new video with generated sound effects (async).',
  })
  @ApiBody({ type: GenerateAudioDto })
  @ApiResponse({ status: 201, description: 'Audio generation task added to queue' })
  async generate(
    @Body() dto: GenerateAudioDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.audioGenerationService.addAudioTaskToQueue(dto, req.user.id);
    return { message: 'Audio generation task has been added to the queue.' };
  }
}

