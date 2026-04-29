import { IsOptional, IsString, IsUrl, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePostMediaDto {
  @ApiPropertyOptional({
    description: 'New image URL for the post (for image posts)',
    example: 'https://res.cloudinary.com/xxx/image/upload/v1/photo.jpg',
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  imageUrl?: string;

  @ApiPropertyOptional({
    description: 'New video URL for the post (for video posts)',
    example: 'https://res.cloudinary.com/xxx/video/upload/v1/video.mp4',
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  videoUrl?: string;

  @ApiPropertyOptional({
    description: 'Preview image URL for video posts (thumbnail)',
    example: 'https://res.cloudinary.com/xxx/image/upload/v1/preview.jpg',
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  previewImageUrl?: string;
}
