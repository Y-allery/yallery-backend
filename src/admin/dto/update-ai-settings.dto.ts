import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsBoolean, IsArray, IsEnum, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateAISettingsDto {
  @ApiPropertyOptional({ description: 'AI service identifier (e.g., flux, aura_flow, byty_dance)' })
  @IsOptional()
  @IsString()
  ai_service?: string;

  @ApiPropertyOptional({ description: 'Display name of the AI model' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ 
    description: 'Allowed orientations', 
    type: [String],
    example: ['horizontal', 'vertical']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedOrientations?: string[];

  @ApiPropertyOptional({ description: 'Minimum number of images that can be generated' })
  @IsOptional()
  @IsNumber()
  minImages?: number;

  @ApiPropertyOptional({ description: 'Maximum number of images that can be generated' })
  @IsOptional()
  @IsNumber()
  maxImages?: number;

  @ApiPropertyOptional({ description: 'Maximum prompt length in characters' })
  @IsOptional()
  @IsNumber()
  maxPromptLength?: number;

  @ApiPropertyOptional({ 
    description: 'Available image sizes', 
    type: [String],
    example: ['1024x1024', '1536x640', '768x1344']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sizes?: string[] | null;

  @ApiPropertyOptional({ 
    description: 'Quality options', 
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  qualityOptions?: string[] | null;

  @ApiPropertyOptional({ 
    description: 'Available styles', 
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  styles?: string[] | null;

  @ApiPropertyOptional({ description: 'Cost per image/video in credits' })
  @IsOptional()
  @IsNumber()
  cost?: number;

  @ApiPropertyOptional({ description: 'API model identifier (e.g., fal-ai/flux-pro/v1.1-ultra)' })
  @IsOptional()
  @IsString()
  api_model?: string | null;

  @ApiPropertyOptional({ description: 'Description of the AI model' })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ 
    description: 'Type of AI model', 
    enum: ['image', 'video', 'audio']
  })
  @IsOptional()
  @IsEnum(['image', 'video', 'audio'])
  type?: 'image' | 'video' | 'audio';

  @ApiPropertyOptional({ description: 'Whether this is an Artem model' })
  @IsOptional()
  @IsBoolean()
  is_artem?: boolean;

  @ApiPropertyOptional({ description: 'Whether the model is active' })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

