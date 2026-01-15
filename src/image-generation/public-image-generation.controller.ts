import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ImageGenerationService } from './image-generation.service';
import {
  PublicFineTuneGenerateRequestDto,
  PublicFineTuneGenerateResponseDto,
} from './dto/public-finetune-generate.dto';

@ApiTags('Public Image Generation')
@Controller('public/image-generation')
export class PublicImageGenerationController {
  constructor(private readonly imageGenerationService: ImageGenerationService) {}

  @Post('fine-tune/generate')
  @ApiOperation({
    summary: 'Generate images (public, no auth, no credits) using a fixed fine-tune token',
    description: [
      'This endpoint is **public** (no JWT required) and does **not** charge user credits.',
      '',
      'It always uses the fixed fine-tune token on the backend:',
      '`fca9b669-380a-4d5e-873b-ac0b116c82a0`',
      '',
      'The request accepts only a prompt and number of images. The response returns the generated image URLs (uploaded to Cloudinary) directly in HTTP.',
      '',
      '**Notes:**',
      '- Generation is performed synchronously (no queue).',
      '- The provider model is read from `ai_settings` for `flux_pro_fine_tune`.',
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


