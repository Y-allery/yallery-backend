import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateMemeDto {
  @IsNumber()
  @ApiProperty({ description: 'Meme template ID', example: 1 })
  memeId: number;

  @IsString()
  @ApiProperty({
    description: 'User image URL (source image for generation)',
    example: 'https://res.cloudinary.com/xxx/image/upload/v1/user-photo.jpg',
  })
  imageUrl: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description: 'Optional text prompt for Replicate/Kling',
    example: '',
  })
  prompt?: string;

  @IsOptional()
  @IsIn(['image', 'video'])
  @ApiPropertyOptional({
    description: 'Character orientation for Kling: "image" or "video"',
    enum: ['image', 'video'],
    default: 'video',
  })
  characterOrientation?: 'image' | 'video';
}
