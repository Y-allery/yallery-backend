import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUrl } from 'class-validator';

export class GenerateEditImageDto {
  @IsString()
  @ApiProperty({
    description: 'Prompt describing how the source image should be edited.',
    example: 'Change hair color to red and background to New York city.',
  })
  prompt: string;

  @IsString()
  @ApiProperty({
    description: 'Requested AI service/model identifier.',
    example: 'qwen_image_edit_baked',
  })
  ai_service: string;

  @IsUrl()
  @ApiProperty({
    description: 'Source image URL to edit.',
    example: 'https://example.com/source-image.jpg',
  })
  image_url: string;

  @IsOptional()
  @IsInt()
  @ApiPropertyOptional({
    description: 'Optional style ID. When provided, the backend enriches the edit prompt with the selected style.',
    example: 12,
  })
  style_id?: number;

  @IsOptional()
  @IsInt()
  @ApiPropertyOptional({
    description: 'Optional color ID. When provided, the backend enriches the edit prompt with the selected color direction.',
    example: 3,
  })
  color_id?: number;

  @IsOptional()
  @IsInt()
  @ApiPropertyOptional({
    description: 'Optional contest ID. When present, edited images are attached to the contest flow.',
    example: 12,
  })
  contest_id?: number;
}
