import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AIEnum } from 'src/common/enums/ai.enum';
import { OctoAI } from '@octoai/sdk';

export class GenerateImageDto {
  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'The ID of the tag' })
  tag_id: number;

  @IsNumber()
  @IsOptional()
  @ApiProperty({ description: 'The ID of the tag' })
  contest_id: number;

  @IsString()
  @ApiProperty({ description: 'The prompt text for the post' })
  prompt: string;

  @IsEnum(AIEnum)
  @ApiProperty({ description: 'The AI service to be used', enum: AIEnum })
  ai_service: AIEnum;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ description: 'The style ID (optional)' })
  style_id: number;

  @IsEnum(['horizontal', 'vertical'])
  @ApiProperty({
    description: 'Orientation of the image',
    enum: ['horizontal', 'vertical'],
  })
  orientation: 'horizontal' | 'vertical';

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ description: 'The color ID (optional)' })
  color_id: number;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional({ description: 'AI select tag' })
  auto_tag_select: boolean;

  @IsInt()
  @Min(1)
  @Max(10)
  @ApiProperty({
    description: 'Number of images to generate',
    minimum: 1,
    maximum: 10,
  })
  image_quantity: number;

  style: OctoAI.imageGen.SdxlStyles;
}
