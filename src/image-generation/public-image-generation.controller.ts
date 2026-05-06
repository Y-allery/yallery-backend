import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ImageGenerationService } from './image-generation.service';
import {
  PublicFineTuneGenerateRequestDto,
  PublicFineTuneGenerateResponseDto,
  PublicFineTunePresetEnum,
} from './dto/public-finetune-generate.dto';

@ApiTags('Public Image Generation')
@Controller('public/image-generation')
export class PublicImageGenerationController {
  constructor(private readonly imageGenerationService: ImageGenerationService) {}

  @Post('fine-tune/generate')
  @ApiOperation({
    summary: 'Generate images (public, no auth, no credits) using the Nomisma RunPod fine-tune',
    description: [
      'This endpoint is **public** (no JWT required) and does **not** charge user credits.',
      '',
      'For the current collaboration flow it always uses the trained Nomisma RunPod LoRA:',
      `- \`nomisma_style_8acd427f\``,
      '',
      'The request accepts only a prompt and number of images. The response returns the generated image URLs (uploaded to Cloudinary) directly in HTTP.',
      '',
      '**Notes:**',
      '- Generation is performed synchronously (no queue).',
      '- The `preset` request field is kept for backwards compatibility but is ignored by the backend for now.',
    ].join('\n'),
  })
  @ApiBody({ type: PublicFineTuneGenerateRequestDto })
  @ApiResponse({
    status: 201,
    description: 'Images generated successfully.',
    type: PublicFineTuneGenerateResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request or AI service misconfigured.',
  })
  async generateFineTuneImagesPublic(
    @Body() dto: PublicFineTuneGenerateRequestDto,
  ): Promise<PublicFineTuneGenerateResponseDto> {
    const start = Date.now();
    const result = await this.imageGenerationService.generateFineTuneImagesPublic(
      dto.prompt,
      dto.imageQuantity,
      dto.preset ?? PublicFineTunePresetEnum.NOMISMA,
    );

    return {
      success: true,
      images: result.images,
      fineTuneToken: result.fineTuneToken,
      providerModel: result.providerModel,
      elapsedMs: Date.now() - start,
    };
  }
}

