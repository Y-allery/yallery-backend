import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';
import { GenerateMediaImageDto } from './dto/generate-media-image.dto';
import { EnqueueMediaImageResponseDto } from './dto/enqueue-media-image-response.dto';
import { GenerateMediaImageResponseDto } from './dto/generate-media-image-response.dto';
import { MediaImageGenerationService } from './media-image-generation.service';

@ApiTags('Media Generation')
@Controller('media-generation/images')
@UseGuards(JwtAuthGuard)
export class MediaImageGenerationController {
  constructor(
    private readonly mediaImageGenerationService: MediaImageGenerationService,
  ) {}

  @Post('generate')
  @ApiOperation({
    summary: 'Queue image generation through the new isolated RunPod media layer',
    description: [
      'This route belongs to the new `media-generation` module.',
      '',
      'It accepts an authenticated user request, stores a media-generation request row, then schedules backend orchestration for RunPod + Cloudinary + websocket delivery.',
      'Final images are delivered over sockets with legacy-compatible `imageGenerated` / `undeliveredImages` payloads.',
    ].join('\n'),
  })
  @ApiBody({ type: GenerateMediaImageDto })
  @ApiResponse({
    status: 202,
    description: 'Image generation task added to backend queue.',
    type: EnqueueMediaImageResponseDto,
  })
  @HttpCode(HttpStatus.ACCEPTED)
  async generate(
    @Body() dto: GenerateMediaImageDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<EnqueueMediaImageResponseDto> {
    const result = await this.mediaImageGenerationService.enqueue(
      dto,
      req.user.id,
    );

    return {
      success: true,
      message: 'Image generation task has been added to the queue.',
      requestId: result.requestId,
      status: result.status,
    };
  }
}
