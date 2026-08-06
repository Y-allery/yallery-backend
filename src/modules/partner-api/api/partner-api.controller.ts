import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiExcludeEndpoint,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { PartnerGenerationService } from '../application/partner-generation.service';
import { PartnerJobService } from '../application/partner-job.service';
import {
  PARTNER_MODELS,
  PartnerCapability,
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
  PartnerAcceptedJobDto,
  PartnerErrorDto,
  PartnerGenerationResponseDto,
  PartnerJobDto,
  PartnerModelListDto,
} from './dto/partner-response.dto';

/**
 * A generation answers in one of two ways.
 *
 * Without `callback_url` the request blocks and returns the finished result, exactly as it
 * always has. With one, it returns 202 and a job id immediately and the result is POSTed to
 * that URL when it is ready — which is the only workable shape for video, where the wait is
 * long enough that somebody's proxy will hang up before we answer.
 */
type PartnerGenerationReply =
  | PartnerGenerationResponseDto
  | PartnerAcceptedJobDto;

@ApiTags('Generation API')
@ApiSecurity(PARTNER_API_KEY_SECURITY)
@ApiResponse({
  status: 400,
  description: 'Invalid request',
  type: PartnerErrorDto,
})
@ApiResponse({
  status: 401,
  description: 'Missing or invalid API key',
  type: PartnerErrorDto,
})
@ApiResponse({
  status: 402,
  description: "The key's spend limit is reached",
  type: PartnerErrorDto,
})
@ApiResponse({
  status: 429,
  description: 'Rate limit exceeded',
  type: PartnerErrorDto,
})
@Controller('v1')
@UseFilters(PartnerExceptionFilter)
@UseGuards(PartnerKeyGuard, PartnerRateLimitGuard)
export class PartnerApiController {
  constructor(
    private readonly generation: PartnerGenerationService,
    private readonly jobs: PartnerJobService,
  ) {}

  private keyOf(request: PartnerRequest): PartnerApiKeyEntity {
    return request.partnerKey;
  }

  /**
   * Validates and pays for the call, then either waits for it or hands back a job.
   *
   * The split happens after `submit`, never before: whichever mode the partner picked, a
   * bad model, an unusable size or an empty balance is an error on this request rather than
   * something they discover from a callback later.
   */
  private async dispatch(
    dto: {
      model: string;
      prompt: string;
      size?: string;
      seed?: number;
      n?: number;
      callback_url?: string;
    },
    capability: PartnerCapability,
    images: string[] | undefined,
    request: PartnerRequest,
    response: { status(code: number): unknown },
  ): Promise<PartnerGenerationReply> {
    const { callback_url: callbackUrl, ...rest } = dto;
    const job = await this.generation.submit(
      { ...rest, images, capability, callbackUrl },
      this.keyOf(request),
    );

    if (!job.callbackUrl) return this.generation.execute(job);

    response.status(HttpStatus.ACCEPTED);
    return this.jobs.view(job);
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
      'Generates an image from a text prompt. Typical latency is a few seconds; without ' +
      '`callback_url` the request blocks until the image is ready, so allow a 120 s client ' +
      'timeout.',
  })
  @ApiResponse({ status: 201, type: PartnerGenerationResponseDto })
  @ApiResponse({
    status: 202,
    description: 'Accepted for asynchronous delivery to `callback_url`.',
    type: PartnerAcceptedJobDto,
  })
  generateImage(
    @Body() dto: PartnerImageGenerationDto,
    @Req() request: PartnerRequest,
    @Res({ passthrough: true }) response: { status(code: number): unknown },
  ): Promise<PartnerGenerationReply> {
    return this.dispatch(dto, 'text_to_image', undefined, request, response);
  }

  @Post('images/edits')
  @ApiOperation({
    summary: 'Photo to photo',
    description:
      'Edits one or more reference images following the prompt. The first image is the one ' +
      'being edited; further images contribute a subject, object or style.',
  })
  @ApiResponse({ status: 201, type: PartnerGenerationResponseDto })
  @ApiResponse({
    status: 202,
    description: 'Accepted for asynchronous delivery to `callback_url`.',
    type: PartnerAcceptedJobDto,
  })
  editImage(
    @Body() dto: PartnerImageEditDto,
    @Req() request: PartnerRequest,
    @Res({ passthrough: true }) response: { status(code: number): unknown },
  ): Promise<PartnerGenerationReply> {
    const { images, ...rest } = dto;
    return this.dispatch(rest, 'image_to_image', images, request, response);
  }

  @Post('videos/generations')
  @ApiOperation({
    summary: 'Photo to video',
    description:
      'Animates a still image into a short clip. This is the slow one — 40 to 120 s is normal, ' +
      'so either pass `callback_url` and let us deliver it, or use a 300 s client timeout and ' +
      'do not retry on your own timeout alone.',
  })
  @ApiResponse({ status: 201, type: PartnerGenerationResponseDto })
  @ApiResponse({
    status: 202,
    description: 'Accepted for asynchronous delivery to `callback_url`.',
    type: PartnerAcceptedJobDto,
  })
  generateVideo(
    @Body() dto: PartnerVideoGenerationDto,
    @Req() request: PartnerRequest,
    @Res({ passthrough: true }) response: { status(code: number): unknown },
  ): Promise<PartnerGenerationReply> {
    const { image, ...rest } = dto;
    return this.dispatch(rest, 'image_to_video', [image], request, response);
  }

  @Get('jobs/:id')
  @ApiOperation({
    summary: 'Fetch a job',
    description:
      'The state of any generation, whichever way it was started. This is how you recover ' +
      'a result whose callback never arrived, and how you follow an asynchronous job if ' +
      'you have nowhere to receive a callback at all.\n\n' +
      '`queued` and `running` carry no result yet; `succeeded` carries `data` and `usage`; ' +
      '`failed` carries `error` and means the money was refunded in full.',
  })
  @ApiParam({ name: 'id', example: 'job_9f2c1b7a4d6e8f0a1b2c3d4e' })
  @ApiResponse({ status: 200, type: PartnerJobDto })
  @ApiResponse({
    status: 404,
    description: 'No such job',
    type: PartnerErrorDto,
  })
  async job(
    @Param('id') id: string,
    @Req() request: PartnerRequest,
  ): Promise<PartnerJobDto> {
    const job = await this.jobs.findForKey(id, this.keyOf(request));
    return this.jobs.view(job) as PartnerJobDto;
  }

  @Get('ping')
  @ApiExcludeEndpoint()
  ping(): { ok: true } {
    return { ok: true };
  }
}
