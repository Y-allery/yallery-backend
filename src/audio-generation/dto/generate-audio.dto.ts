import { IsEnum, IsOptional, IsString, IsUrl, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AudioAIEnum } from 'src/common/enums/ai.enum';

export class GenerateAudioDto {
  @IsUrl()
  @IsString()
  @ApiProperty({
    description:
      'Source video URL (publicly accessible). The model will generate synced sound effects and return a new video.',
    example: 'https://example.com/input.mp4',
  })
  video_url: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description: 'Optional sound prompt to guide the sound effects generation.',
    example: 'Add dramatic explosions and footsteps',
  })
  sound_prompt?: string;

  // Backward-compatible alias (old clients)
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description:
      '[Deprecated] Use sound_prompt. Optional text prompt to guide the sound effects generation.',
    example: 'Add dramatic explosions and footsteps',
    required: false,
  })
  text_prompt?: string;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({
    description: 'Duration of generated audio in seconds (default: 10)',
    example: 10,
  })
  duration?: number;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({
    description: 'Start offset in seconds for audio generation (default: 0)',
    example: 0,
  })
  start_offset?: number;

  @IsEnum(AudioAIEnum)
  @ApiProperty({ description: 'The AI service to be used', enum: AudioAIEnum })
  ai_service: AudioAIEnum;
}

