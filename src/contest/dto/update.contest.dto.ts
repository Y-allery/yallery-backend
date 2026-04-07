import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ContestStatusEnum } from 'src/contest/types/contest.status.enum';
import { SocialPostSettingsDto } from 'src/admin/dto/create-contest.dto';

export class UpdateContestDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @IsOptional()
  @ApiPropertyOptional({
    default: 'Dominos',
    type: String,
  })
  name?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({
    default: 'https://example.com/image.jpg',
    type: String,
  })
  imageUrl?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  @IsOptional()
  @ApiPropertyOptional({
    default: 'Update description here',
    type: String,
  })
  description?: string;

  @IsNumber()
  @IsOptional()
  @ApiPropertyOptional({
    default: 300,
    type: Number,
  })
  reward?: number;

  @IsDateString()
  @IsOptional()
  @ApiPropertyOptional({
    type: Date,
  })
  start_time?: Date;

  @IsDateString()
  @IsOptional()
  @ApiPropertyOptional({
    type: Date,
  })
  end_time?: Date;

  @IsNumber()
  @IsOptional()
  @ApiPropertyOptional({
    default: 1,
    type: Number,
  })
  tag_id?: number;

  @IsEnum(ContestStatusEnum)
  @IsOptional()
  @ApiPropertyOptional({
    default: ContestStatusEnum.CLOSED,
    enum: ContestStatusEnum,
  })
  status?: ContestStatusEnum;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(100)
  @ApiPropertyOptional({
    default: `Token for fal ai fine tune`,
    type: String,
    nullable: true,
  })
  fineTuneToken?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(100)
  @ApiPropertyOptional({
    default: `Token for fal ai fine tune`,
    type: String,
    nullable: true,
  })
  fineTuneTriggerWord?: string | null;

  @IsNumber()
  @Max(2)
  @Min(0)
  @IsOptional()
  @ApiPropertyOptional({
    default: 1,
    type: Number,
    nullable: true,
  })
  fineTuneStrength?: number | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => SocialPostSettingsDto)
  @ApiPropertyOptional({
    type: () => SocialPostSettingsDto,
    description: 'Post winner to Twitter / Instagram',
  })
  socialPostSettings?: SocialPostSettingsDto;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({
    default: 1,
    type: Number,
    description:
      'Optional media_ai_settings row used by this contest. Fine-tune contests automatically use flux_fine_tune.',
  })
  media_ai_setting_id?: number;
}
