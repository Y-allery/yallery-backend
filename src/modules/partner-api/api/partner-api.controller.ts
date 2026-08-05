import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiExcludeEndpoint,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { PartnerGenerationService } from '../application/partner-generation.service';
import {
  PARTNER_MODELS,
  describePartnerModel,
} from '../domain/partner-model.catalog';
import { PartnerApiKeyEntity } from '../entities/partner-api-key.entity';
import {
  PartnerKeyGuard,
  PartnerRequest,
  PARTNER_API_KEY_SECURITY,
} from '../infrastructure/partner-key.guard';
import { PartnerExceptionFilter } from '../infrastructure/partner-exception.filter';
import { PartnerRateLimitGuard } from '../infrastructure/partner-rate-limit.guard';
import {
  PartnerImageEditDto,
  PartnerImageGenerationDto,
  PartnerVideoGenerationDto,
} from './dto/partner-generation.dto';
import {
  PartnerErrorDto,
  PartnerGenerationResponseDto,
  PartnerModelListDto,
} from './dto/partner-response.dto';

@ApiTags('Generation API')
@ApiSecurity(PARTNER_API_KEY_SECURITY)
@ApiResponse({ status: 400, description: 'Invalid request', type: PartnerErrorDto })
@ApiResponse({ status: 401, description: 'Missing or invalid API key', type: PartnerErrorDto })
@ApiResponse({
  status: 402,
  description: "The key's spend limit is reached",
  type: PartnerErrorDto,
})
@ApiResponse({ status: 429, description: 'Rate limit exceeded', type: PartnerErrorDto })
@Controller('v1')
@UseFilters(PartnerExceptionFilter)
@UseGuards(PartnerKeyGuard, PartnerRateLimitGuard)
export class PartnerApiController {
  constructor(private readonly generation: PartnerGenerationService) {}

  private keyOf(request: PartnerRequest): PartnerApiKeyEntity {
    return request.partnerKey;
  }

  @Get('models')
  @ApiOperation({
    summary: 'List available models',
    description:
      'Every model you can address, with its price per output and the sizes it accepts. ' +
      'Prices are final — what you see is what you are billed.',
  })
  @ApiResponse({ status: 200, type: PartnerModelListDto })
  listModels(): PartnerModelListDto {
    return { object: 'list', data: PARTNER_MODELS.map(describePartnerModel) };
  }

  @Post('images/generations')
  @ApiOperation({
    summary: 'Text to image',
    description:
      'Generates an image from a text prompt. Typical latency is a few seconds; the request ' +
      'blocks until the image is ready, so allow a 120 s client timeout.',
  })
  @ApiResponse({ status: 201, type: PartnerGenerationResponseDto })
  generateImage(
    @Body() dto: PartnerImageGenerationDto,
    @Req() request: PartnerRequest,
  ): Promise<PartnerGenerationResponseDto> {
    return this.generation.generate(
      { ...dto, capability: 'text_to_image' },
      this.keyOf(request),
    );
  }

  @Post('images/edits')
  @ApiOperation({
    summary: 'Photo to photo',
    description:
      'Edits one or more reference images following the prompt. The first image is the one ' +
      'being edited; further images contribute a subject, object or style.',
  })
  @ApiResponse({ status: 201, type: PartnerGenerationResponseDto })
  editImage(
    @Body() dto: PartnerImageEditDto,
    @Req() request: PartnerRequest,
  ): Promise<PartnerGenerationResponseDto> {
    return this.generation.generate(
      { ...dto, capability: 'image_to_image' },
      this.keyOf(request),
    );
  }

  @Post('videos/generations')
  @ApiOperation({
    summary: 'Photo to video',
    description:
      'Animates a still image into a short clip. This is the slow one — 40 to 120 s is normal, ' +
      'so use a 300 s client timeout and do not retry on your own timeout alone.',
  })
  @ApiResponse({ status: 201, type: PartnerGenerationResponseDto })
  generateVideo(
    @Body() dto: PartnerVideoGenerationDto,
    @Req() request: PartnerRequest,
  ): Promise<PartnerGenerationResponseDto> {
    const { image, ...rest } = dto;
    return this.generation.generate(
      { ...rest, images: [image], capability: 'image_to_video' },
      this.keyOf(request),
    );
  }

  @Get('ping')
  @ApiExcludeEndpoint()
  ping(): { ok: true } {
    return { ok: true };
  }
}
