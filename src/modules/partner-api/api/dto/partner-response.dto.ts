import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PartnerOutputDto {
  @ApiProperty({
    description:
      'Direct URL to the generated file. Download it — the link is not guaranteed to stay reachable.',
  })
  url: string;

  @ApiPropertyOptional({
    description: 'Seed this output was produced with. Reuse it to reproduce.',
  })
  seed?: number;
}

export class PartnerUsageDto {
  @ApiProperty({ description: 'Server-side generation time in milliseconds.' })
  generation_time_ms: number;

  @ApiProperty({
    description: 'Amount billed for this request, in USD. Covers every output.',
    example: 0.015,
  })
  price_usd: number;
}

export class PartnerGenerationResponseDto {
  @ApiProperty({
    description: 'Job id. Pass it to GET /v1/jobs/{id} at any time.',
    example: 'job_9f2c1b7a4d6e8f0a1b2c3d4e',
  })
  id: string;

  @ApiProperty({ example: 'generation' })
  object: string;

  @ApiProperty({
    enum: ['queued', 'running', 'succeeded', 'failed'],
    description: 'Always `succeeded` on a synchronous response.',
  })
  status: string;

  @ApiProperty({ description: 'Unix timestamp, seconds.' })
  created: number;

  @ApiProperty({ example: 'yengine-photo' })
  model: string;

  @ApiProperty({ type: [PartnerOutputDto] })
  data: PartnerOutputDto[];

  @ApiProperty({ type: PartnerUsageDto })
  usage: PartnerUsageDto;
}

export class PartnerAcceptedJobDto {
  @ApiProperty({ example: 'job_9f2c1b7a4d6e8f0a1b2c3d4e' })
  id: string;

  @ApiProperty({ example: 'generation' })
  object: string;

  @ApiProperty({ enum: ['queued'] })
  status: string;

  @ApiProperty({ example: 'yengine-photo' })
  model: string;

  @ApiProperty({ description: 'Unix timestamp, seconds.' })
  created: number;
}

export class PartnerJobDto extends PartnerAcceptedJobDto {
  @ApiPropertyOptional({
    type: [PartnerOutputDto],
    description: 'Present once the job succeeded.',
  })
  data?: PartnerOutputDto[];

  @ApiPropertyOptional({ type: PartnerUsageDto })
  usage?: PartnerUsageDto;

  @ApiPropertyOptional({
    description: 'Present when the job failed. The money was refunded in full.',
  })
  error?: { type: string; message: string };
}

export class PartnerModelDto {
  @ApiProperty({ example: 'yengine-photo' })
  id: string;

  @ApiProperty({
    enum: ['text_to_image', 'image_to_image', 'image_to_video'],
  })
  capability: string;

  @ApiProperty()
  description: string;

  @ApiProperty({
    description: 'Price per output, in USD. This is the final price.',
    example: 0.015,
  })
  price_usd: number;

  @ApiProperty({ type: [String], example: ['1024x1024'] })
  sizes: string[];
}

export class PartnerModelListDto {
  @ApiProperty({ example: 'list' })
  object: string;

  @ApiProperty({ type: [PartnerModelDto] })
  data: PartnerModelDto[];
}

export class PartnerErrorBodyDto {
  @ApiProperty({
    enum: [
      'invalid_request_error',
      'authentication_error',
      'rate_limit_error',
      'quota_exceeded',
      'generation_error',
    ],
  })
  type: string;

  @ApiProperty()
  message: string;

  @ApiPropertyOptional({
    description: 'Which field caused it, when it is one.',
  })
  param?: string;
}

export class PartnerErrorDto {
  @ApiProperty({ type: PartnerErrorBodyDto })
  error: PartnerErrorBodyDto;
}
