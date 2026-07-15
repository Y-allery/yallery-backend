import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMemeDto {
  @IsString()
  @MaxLength(255)
  @ApiProperty({ description: 'Meme template name', example: 'Dance Challenge' })
  name: string;

  @IsNumber()
  @ApiProperty({ description: 'Tag ID to attach generated posts to', example: 1 })
  tagId: number;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  @ApiPropertyOptional({
    description: 'Reference video URL for motion (Kling model)',
    example: 'https://yallery-api-prod.org/media/video/upload/octoai_videos/ref.mp4',
  })
  referenceVideoUrl?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @ApiPropertyOptional({
    description:
      'Reference video duration in seconds. Used to calculate meme generation cost.',
    example: 9.833333,
  })
  referenceVideoDurationSeconds?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  @ApiPropertyOptional({
    description: 'Reference GIF/image URL (preview for meme)',
    example: 'https://yallery-api-prod.org/media/image/upload/octoai_images/ref.gif',
  })
  referenceImageUrl?: string;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ description: 'Whether the meme is active', default: true })
  isActive?: boolean;
}
