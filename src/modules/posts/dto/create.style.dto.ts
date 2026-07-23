import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateStyleDto {
  @ApiProperty({ example: 'Gothic' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 'gothic', required: false })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiProperty({ example: 'http://example.com/image.jpg' })
  @IsNotEmpty()
  @IsString()
  imageUrl: string;

  @ApiPropertyOptional({
    example:
      'dark gothic illustration, dramatic chiaroscuro lighting, ornate detail, muted desaturated palette',
    description:
      'Core positive style descriptor woven into every model prompt.',
  })
  @IsOptional()
  @IsString()
  positiveTemplate?: string;

  @ApiPropertyOptional({
    example: 'bright, cheerful, pastel, flat lighting, cartoon',
    description: 'Style-specific negative prompt.',
  })
  @IsOptional()
  @IsString()
  negativeTemplate?: string;

  @ApiPropertyOptional({
    example: ['gothic', 'dark fantasy', 'ornate'],
    description: 'Visual-style tokens used by image generation models.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @ApiPropertyOptional({
    description:
      'Per-aiService overrides, e.g. { "krea2_turbo": { "keywords": ["gothic"] }, "flux2_klein": { "positive": "..." } }.',
  })
  @IsOptional()
  @IsObject()
  modelOverrides?: Record<
    string,
    { positive?: string; negative?: string; keywords?: string[] }
  >;

  @ApiPropertyOptional({
    example: 7,
    description: 'Recommended CFG (clamped per model).',
  })
  @IsOptional()
  @IsNumber()
  recommendedCfg?: number;

  @ApiPropertyOptional({
    example: 30,
    description: 'Recommended steps (clamped per model).',
  })
  @IsOptional()
  @IsNumber()
  recommendedSteps?: number;
}
