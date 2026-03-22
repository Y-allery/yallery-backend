import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { GenerateMediaImageDto } from './dto/generate-media-image.dto';
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
    summary: 'Generate images through the new isolated RunPod media layer',
    description: [
      'This route belongs to the new `media-generation` module.',
      '',
      'It does not use legacy image-generation queues, processors, or AI settings.',
      'The request is sent to the RunPod Serverless image endpoint, waits for completion, then uploads the resulting images to Cloudinary and returns them directly.',
    ].join('\n'),
  })
  @ApiBody({ type: GenerateMediaImageDto })
  @ApiResponse({
    status: 201,
    description: 'Images generated successfully.',
    type: GenerateMediaImageResponseDto,
  })
  async generate(
    @Body() dto: GenerateMediaImageDto,
  ): Promise<GenerateMediaImageResponseDto> {
    const startedAt = Date.now();
    const result = await this.mediaImageGenerationService.generate(dto);

    return {
      success: true,
      images: result.images,
      jobId: result.jobId,
      providerModel: result.providerModel,
      elapsedMs: Date.now() - startedAt,
    };
  }
}
