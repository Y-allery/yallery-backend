import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateAISettingsPricingDto {
  @ApiPropertyOptional({
    description: 'Pricing strategy for duration-based models',
    enum: ['fixed', 'per_second'],
  })
  @IsOptional()
  @IsEnum(['fixed', 'per_second'])
  strategy?: 'fixed' | 'per_second';

  @ApiPropertyOptional({ description: 'Credits charged per generated second' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  creditsPerSecond?: number;
}

export class UpdateMediaAISettingsJsonDto {
  @ApiPropertyOptional({ description: 'Minimum number of images that can be generated' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  minImages?: number;

  @ApiPropertyOptional({ description: 'Maximum number of images that can be generated' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxImages?: number;

  @ApiPropertyOptional({ description: 'Maximum prompt length in characters' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxPromptLength?: number;

  @ApiPropertyOptional({
    description: 'Supported video durations in seconds',
    type: [Number],
    example: [5, 10],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(10, { each: true })
  durations?: number[];

  @ApiPropertyOptional({ description: 'Video pricing policy' })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateAISettingsPricingDto)
  pricing?: UpdateAISettingsPricingDto;
}

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

  @ApiPropertyOptional({ description: 'Provider model identifier, when the model needs one' })
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

  @ApiPropertyOptional({ description: 'Whether the model is active (camelCase alias)' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Structured media model settings. Currently editable for video_generate models.',
    type: UpdateMediaAISettingsJsonDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateMediaAISettingsJsonDto)
  settings?: UpdateMediaAISettingsJsonDto;
}
