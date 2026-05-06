import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';
import { MEDIA_ORIENTATIONS, MediaOrientation } from 'src/modules/media-generation/domain/presets';

export class GenerateImageVideoDto {
  @IsString()
  @ApiProperty({
    description: 'Prompt text used to animate the source image into a video.',
    example: 'Subtle cinematic motion, hair moving gently, realistic city ambience',
  })
  prompt: string;

  @IsString()
  @ApiProperty({
    description: 'Requested AI service/model identifier.',
    example: 'p_video_image',
  })
  ai_service: string;

  @IsUrl()
  @ApiProperty({
    description: 'Source image URL used for image-to-video generation.',
    example: 'https://image.runpod.ai/assets/pruna/pruna-video.png',
  })
  image_url: string;

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
