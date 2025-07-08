import { VideoGenerationService } from './video-generation.service';
import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';
import { GenerateVideoDto } from './dto/generate-video.dto';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';

@ApiTags('Video Generation')
@Controller('video-generation')
@UseGuards(JwtAuthGuard)
export class VideoGenerationController {
  constructor(
    private readonly videoGenerationService: VideoGenerationService,
  ) {}

  @Get('ai-settings')
  getAllAISettings() {
    return this.videoGenerationService.getAllAISettings();
  }
  //sdasdasdівівsdsdsdів
  @Post('generate-video')
  async generateOctoAI(
    @Body() createVideoDto: GenerateVideoDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.videoGenerationService.addVideoTaskToQueue(
      createVideoDto,
      req.user.id,
    );

    return {
      message: 'Video generation task has been added to the queue.',
    };
  }
}
