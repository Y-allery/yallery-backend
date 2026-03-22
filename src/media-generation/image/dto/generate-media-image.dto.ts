import { Transform, Type } from 'class-transformer';
import {
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
