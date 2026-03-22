import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GenerateMediaImageDto } from './dto/generate-media-image.dto';
import { GenerateMediaImageResponseDto } from './dto/generate-media-image-response.dto';
import { MediaImageGenerationService } from './media-image-generation.service';

@ApiTags('Public Media Generation')
@Controller('public/media-generation/images')
export class PublicMediaImageGenerationController {
  constructor(
    private readonly mediaImageGenerationService: MediaImageGenerationService,
  ) {}

  @Post('generate')
  @ApiOperation({
    summary: 'Public smoke-test route for the new RunPod media image pipeline',
    description: [
      'This route is isolated from the legacy image-generation module.',
      '',
      'Flow:',
      '- submit a prompt to the RunPod image endpoint',
      '- wait for completion',
      '- upload returned images to Cloudinary',
      '- return final image URLs directly in HTTP',
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
