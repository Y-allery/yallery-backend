import { IsString, IsNotEmpty, IsUrl, MinLength, MaxLength, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EditImageDto {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description:
      'Optional AI service for image editing. Must exist in ai_settings with isArtem=true.',
    example: 'grok_image_edit',
  })
  ai_service?: string;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ description: 'Contest ID to attach the post to' })
  contest_id?: number;

  @IsString()
  @IsNotEmpty()
  @IsUrl()
  @MinLength(10)
  @MaxLength(500)
  @ApiProperty({ 
    description: 'URL of the image to edit. Must be a publicly accessible image URL.',
    example: 'https://example.com/image.jpg',
    pattern: '^https?://.*\\.(jpg|jpeg|png|webp)$',
    minLength: 10,
    maxLength: 500
  })
  image_url: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(1000)
  @ApiProperty({ 
    description: 'Detailed text prompt describing how to edit the image. Be specific about what changes you want to make.',
    example: 'Make the background more colorful and add some flowers, change the lighting to golden hour',
    minLength: 5,
    maxLength: 1000
  })
  prompt: string;
} 
