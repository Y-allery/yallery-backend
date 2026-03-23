import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MEDIA_IMAGE_DEFAULT_ORIENTATION,
  MEDIA_IMAGE_MAX_PROMPT_LENGTH,
  MEDIA_IMAGE_MAX_QUANTITY,
  MEDIA_IMAGE_MIN_QUANTITY,
  MediaImageOrientation,
} from '../media-image.constants';

export class GenerateMediaImageDto {
  @ApiProperty({
    description: 'Prompt for the new RunPod-backed media image pipeline.',
    example:
      'A cinematic portrait of a futuristic explorer, realistic lighting, high detail',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(MEDIA_IMAGE_MAX_PROMPT_LENGTH)
  prompt: string;

  @ApiPropertyOptional({
    description:
      'Optional extra context that should influence the image without exposing raw model dimensions.',
    example: 'The explorer should be standing in a frozen neon city at night.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(MEDIA_IMAGE_MAX_PROMPT_LENGTH)
  context?: string;

  @ApiPropertyOptional({
    description: 'Optional negative prompt forwarded to the RunPod worker.',
    example: 'blurry, distorted, watermark, low quality',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(MEDIA_IMAGE_MAX_PROMPT_LENGTH)
  negativePrompt?: string;

  @ApiPropertyOptional({
    description: 'Requested output orientation.',
    enum: MediaImageOrientation,
    default: MEDIA_IMAGE_DEFAULT_ORIENTATION,
  })
  @IsOptional()
  @IsEnum(MediaImageOrientation)
  orientation?: MediaImageOrientation;

  @ApiPropertyOptional({
    description:
      'When true, the backend chooses the best matching tag automatically for standard image generation.',
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  autoSelectTag?: boolean;

  @ApiPropertyOptional({
    description: 'Optional tag reference used to enrich the prompt.',
    minimum: 1,
    example: 12,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tagId?: number;

  @ApiPropertyOptional({
    description: 'Optional style reference used to enrich the prompt.',
    minimum: 1,
    example: 3,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  styleId?: number;

  @ApiPropertyOptional({
    description: 'Optional color reference used to enrich the prompt.',
    minimum: 1,
    example: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  colorId?: number;

  @ApiPropertyOptional({
    description:
      'Optional contest reference. For image v2 it is resolved as shared generation context, not legacy queue logic.',
    minimum: 1,
    example: 7,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  contestId?: number;

  @ApiPropertyOptional({
    description: 'How many images to request from the worker.',
    minimum: MEDIA_IMAGE_MIN_QUANTITY,
    maximum: MEDIA_IMAGE_MAX_QUANTITY,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MEDIA_IMAGE_MIN_QUANTITY)
  @Max(MEDIA_IMAGE_MAX_QUANTITY)
  imageQuantity?: number;
}
