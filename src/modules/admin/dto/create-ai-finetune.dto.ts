import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AIFinetuneDatasetImageDto {
  @ApiProperty({ description: 'Cloudinary image URL' })
  @IsUrl({ require_tld: false })
  url: string;

  @ApiPropertyOptional({ description: 'Cloudinary public id' })
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
