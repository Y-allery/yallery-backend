import { IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';
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
    description: 'Optional prompt to guide the sound effects generation.',
    example: 'Add dramatic explosions and footsteps',
  })
  prompt?: string;

  @IsEnum(AudioAIEnum)
  @ApiProperty({ description: 'The AI service to be used', enum: AudioAIEnum })
  ai_service: AudioAIEnum;
}

