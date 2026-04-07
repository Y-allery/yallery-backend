import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUrl } from 'class-validator';

export class GenerateAudioDto {
  @IsUrl()
  @ApiProperty({
    description: 'Public video URL used as the source for audio generation.',
    example: 'https://res.cloudinary.com/example/video/upload/v123/source.mp4',
  })
  video_url: string;

  @IsString()
  @ApiProperty({
    description: 'Prompt used to generate the audio track for the source video.',
    example: 'Playful cinematic synthwave soundtrack with soft female vocals.',
  })
  prompt: string;

  @IsString()
  @ApiProperty({
    description: 'Requested audio AI service/model identifier.',
    example: 'mmaudio_v2',
  })
  ai_service: string;

  @IsOptional()
  @IsInt()
  @ApiPropertyOptional({
    description:
      'Optional contest ID. When present, generated audio videos are attached to the contest flow.',
    example: 12,
  })
  contest_id?: number;
}
