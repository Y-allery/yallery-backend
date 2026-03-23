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
import { MEDIA_AUDIO_DEFAULT_DURATION } from '../media-audio.constants';

export class GenerateMediaAudioDto {
  @ApiProperty({
    description: 'Public video URL used as the source for audio generation.',
    example: 'https://res.cloudinary.com/example/video/upload/v1/source.mp4',
  })
  @IsUrl()
  videoUrl: string;

  @ApiProperty({
    description: 'Audio prompt for the new media-generation audio pipeline.',
    example: 'Warm cinematic piano with subtle ambient textures',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  prompt: string;

  @ApiProperty({
    description: 'Audio AI service identifier from ai_settings(type=audio).',
    example: 'mmaudio_v2',
  })
  @IsString()
  @IsNotEmpty()
  aiService: string;

  @ApiPropertyOptional({
    description: 'Optional duration forwarded to the provider.',
    example: MEDIA_AUDIO_DEFAULT_DURATION,
    default: MEDIA_AUDIO_DEFAULT_DURATION,
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
