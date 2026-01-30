import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';
import { GenerateSfxDto } from './dto/generate-sfx.dto';
import { SfxGenerationService } from './sfx-generation.service';

@ApiTags('SFX Generation')
@Controller('sfx-generation')
@UseGuards(JwtAuthGuard)
export class SfxGenerationController {
  constructor(private readonly sfxGenerationService: SfxGenerationService) {}

  @Get('ai-settings')
  @ApiOperation({
    summary: 'Get SFX AI settings',
    description:
      'Retrieve available SFX (video-to-video) AI models and their settings (cost, description, api_model).',
  })
  @ApiResponse({ status: 200, description: 'SFX AI settings retrieved successfully' })
  getAllAISettings() {
    return this.sfxGenerationService.getAllAISettings();
  }

  @Post('generate')
  @ApiOperation({
    summary: 'Generate SFX video',
    description:
      'Adds a job to the SFX generation queue. Takes an input video_url and returns a new video with sound effects (async).',
  })
  @ApiBody({ type: GenerateSfxDto })
  @ApiResponse({ status: 201, description: 'SFX generation task added to queue' })
  async generate(@Body() dto: GenerateSfxDto, @Req() req: AuthenticatedRequest) {
    await this.sfxGenerationService.addSfxTaskToQueue(dto, req.user.id);
    return { message: 'SFX generation task has been added to the queue.' };
  }
}

