import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  MEDIA_ORIENTATIONS,
  MediaOrientation,
} from 'src/modules/media-generation/domain/presets';

export class GenerateTextVideoDto {
  @IsString()
  @ApiProperty({
    description: 'Prompt text used to generate the video.',
    example:
      'Cartoon anamorphic computer says: Runpod is the best. The camera is static. The background is a spaceship. Audio: playful pop music',
  })
  prompt: string;

  @IsString()
  @ApiProperty({
    description: 'Requested AI service/model identifier.',
    example: 'p_video_text',
  })
  ai_service: string;

  @IsOptional()
  @IsIn(MEDIA_ORIENTATIONS)
  @ApiPropertyOptional({
    description: 'Requested output orientation.',
    enum: MEDIA_ORIENTATIONS,
    example: 'vertical',
  })
  orientation?: MediaOrientation;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  @ApiPropertyOptional({
    description: 'Target duration in seconds.',
    minimum: 1,
    maximum: 10,
    example: 5,
  })
  duration?: number;

  @IsOptional()
  @IsInt()
  @ApiPropertyOptional({
    description:
      'Optional contest ID. When present, generated videos are attached to the contest flow.',
    example: 12,
  })
  contest_id?: number;
}
