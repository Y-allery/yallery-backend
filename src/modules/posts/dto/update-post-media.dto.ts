import { IsOptional, IsString, IsUrl, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePostMediaDto {
  @ApiPropertyOptional({
    description: 'New image URL for the post (for image posts)',
    example: 'https://yallery-api-prod.org/media/image/upload/octoai_images/photo.jpg',
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  imageUrl?: string;

  @ApiPropertyOptional({
    description: 'New video URL for the post (for video posts)',
    example: 'https://yallery-api-prod.org/media/video/upload/octoai_videos/video.mp4',
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  videoUrl?: string;

  @ApiPropertyOptional({
    description: 'Preview image URL for video posts (thumbnail)',
    example: 'https://yallery-api-prod.org/media/image/upload/octoai_images/preview.jpg',
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  previewImageUrl?: string;
}
