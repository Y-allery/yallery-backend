import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MEDIA_VIDEO_ALLOWED_DURATIONS,
  MEDIA_VIDEO_DEFAULT_DURATION,
} from '../media-video.constants';

export class GenerateMediaVideoDto {
  @ApiPropertyOptional({
    description: 'Public image URL used for image-to-video models.',
    example: 'https://res.cloudinary.com/example/image/upload/v1/source.png',
  })
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @ApiProperty({
    description: 'Video prompt for the new media-generation video pipeline.',
    example: 'A cinematic drone shot over snowy mountains at sunrise',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  prompt: string;

  @ApiProperty({
    description: 'Video AI service identifier from ai_settings(type=video).',
    example: 'kling_text_to_video',
  })
  @IsString()
  @IsNotEmpty()
  aiService: string;

  @ApiPropertyOptional({
    description: 'Optional duration forwarded to the provider.',
    enum: MEDIA_VIDEO_ALLOWED_DURATIONS,
    default: MEDIA_VIDEO_DEFAULT_DURATION,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  duration?: number;

  @ApiPropertyOptional({
    description: 'Optional standard contest id. Fine-tune contest logic remains on legacy paths.',
    example: 42,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  contestId?: number;
}
