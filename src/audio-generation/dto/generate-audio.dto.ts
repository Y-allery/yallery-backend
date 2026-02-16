import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUrl } from 'class-validator';

export class GenerateAudioDto {
  @IsUrl()
  @ApiProperty({
    description: 'The URL of the video to generate the audio for.',
    example: 'https://res.cloudinary.com/.../video.mp4',
  })
  video_url: string;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ description: 'Contest ID to attach the post to' })
  contest_id?: number;

  @IsString()
  @ApiProperty({
    description: 'The prompt to generate the audio for.',
    example: 'Indian holy music',
  })
  prompt: string;

  @IsString()
  @ApiProperty({
    description: 'Audio AI service identifier (must exist in ai_settings with type=audio).',
    example: 'mmaudio_v2',
  })
  ai_service: string;
}

