import { VideoGenerationService } from './video-generation.service';
import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';
import { GenerateVideoDto } from './dto/generate-video.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { VIDEO_GENERATION_SWAGGER } from 'src/common/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';

@ApiTags('Video Generation')
@Controller('video-generation')
@UseGuards(JwtAuthGuard)
export class VideoGenerationController {
  constructor(
    private readonly videoGenerationService: VideoGenerationService,
  ) {}

  @Get('ai-settings')
  @ApiOperation(VIDEO_GENERATION_SWAGGER.getAllAISettings)
  @ApiResponse(VIDEO_GENERATION_SWAGGER.getAllAISettings.responses.success)
  getAllAISettings() {
    return this.videoGenerationService.getAllAISettings();
  }
  @Post('generate-video')
  @ApiOperation(VIDEO_GENERATION_SWAGGER.generateVideo)
  @ApiBody({ type: GenerateVideoDto })
  @ApiResponse(VIDEO_GENERATION_SWAGGER.generateVideo.responses.success)
  @ApiResponse(VIDEO_GENERATION_SWAGGER.generateVideo.responses.badRequest)
  @ApiResponse(VIDEO_GENERATION_SWAGGER.generateVideo.responses.unauthorized)
  @ApiResponse(VIDEO_GENERATION_SWAGGER.generateVideo.responses.forbidden)
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
