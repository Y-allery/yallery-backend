import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
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
      'Retrieve available audio-generation AI models and their settings (cost, description, api_model).',
  })
  @ApiResponse({ status: 200, description: 'Audio AI settings retrieved successfully' })
  getAllAISettings() {
    return this.audioGenerationService.getAllAISettings();
  }
}

