import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsIn,
  IsBoolean,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  AI_FINETUNE_MODEL_FAMILIES,
  AIFinetuneModelFamily,
} from 'src/modules/admin/entities/ai-finetune.entity';

export class AIFinetuneDatasetImageDto {
  @ApiProperty({ description: 'Dataset image URL' })
  @IsUrl({ require_tld: false })
  url: string;

  @ApiPropertyOptional({
    description:
      'Caption for this image. Krea 2 jobs preserve these as per-image training captions.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  caption?: string;

  @ApiPropertyOptional({ description: 'Storage public id' })
  @IsOptional()
  @IsString()
  publicId?: string;

  @ApiPropertyOptional({ description: 'Image width in pixels' })
  @IsOptional()
  @IsNumber()
  width?: number;

  @ApiPropertyOptional({ description: 'Image height in pixels' })
  @IsOptional()
  @IsNumber()
  height?: number;

  @ApiPropertyOptional({ description: 'File size in bytes' })
  @IsOptional()
  @IsNumber()
  bytes?: number;

  @ApiPropertyOptional({ description: 'Original uploaded file name' })
  @IsOptional()
  @IsString()
  originalName?: string;
}

export class CreateAIFinetuneTrainingDto {
  @ApiPropertyOptional({ default: 512 })
  @IsOptional()
  @IsInt()
  @Min(512)
  @Max(1024)
  resolution?: number;

  @ApiPropertyOptional({ default: 800 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  maxTrainSteps?: number;

  @ApiPropertyOptional({ default: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(128)
  rank?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  trainBatchSize?: number;

  @ApiPropertyOptional({ default: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(32)
  gradientAccumulationSteps?: number;

  @ApiPropertyOptional({ default: '1e-4' })
  @IsOptional()
  @IsString()
  learningRate?: string;

  @ApiPropertyOptional({ default: 'fp16' })
  @IsOptional()
  @IsString()
  mixedPrecision?: string;

  @ApiPropertyOptional({ default: 42 })
  @IsOptional()
  @IsInt()
  seed?: number;

  @ApiPropertyOptional({
    default: false,
    description:
      'Random horizontal flipping. Keep false for asymmetric characters and logos.',
  })
  @IsOptional()
  @IsBoolean()
  enableRandomFlip?: boolean;
}

export class CreateAIFinetuneGenerationDefaultsDto {
  @ApiPropertyOptional({ default: 0.8 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  loraScale?: number;
}

export class CreateAIFinetuneDto {
  @ApiProperty({ example: 'Yallery Slurpy Character' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'yallery_slurpy' })
  @IsString()
  triggerWord: string;

  @ApiPropertyOptional({
    enum: AI_FINETUNE_MODEL_FAMILIES,
    default: 'sdxl',
    description:
      'LoRA architecture family. Omitted legacy requests remain SDXL.',
  })
  @IsOptional()
  @IsIn(AI_FINETUNE_MODEL_FAMILIES)
  modelFamily?: AIFinetuneModelFamily;

  @ApiPropertyOptional({
    description:
      'Canonical training base model. It must belong to modelFamily; defaults are selected by the backend.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  baseModel?: string;

  @ApiPropertyOptional({
    description:
      'Optional override. If omitted, backend generates a unique key from triggerWord.',
  })
  @IsOptional()
  @IsString()
  loraKey?: string;

  @ApiPropertyOptional({ default: 'character' })
  @IsOptional()
  @IsString()
  className?: string;

  @ApiProperty({ type: [AIFinetuneDatasetImageDto] })
  @IsArray()
  @ArrayMinSize(10)
  @ValidateNested({ each: true })
  @Type(() => AIFinetuneDatasetImageDto)
  datasetImages: AIFinetuneDatasetImageDto[];

  @ApiPropertyOptional({ type: CreateAIFinetuneTrainingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateAIFinetuneTrainingDto)
  training?: CreateAIFinetuneTrainingDto;

  @ApiPropertyOptional({ type: CreateAIFinetuneGenerationDefaultsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateAIFinetuneGenerationDefaultsDto)
  generationDefaults?: CreateAIFinetuneGenerationDefaultsDto;
}
