import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
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
  @ValidateNested()
  @Type(() => SocialPostSettingsDto)
  @ApiPropertyOptional({
    type: () => SocialPostSettingsDto,
    description: 'Post winner to Twitter / Instagram',
  })
  socialPostSettings?: SocialPostSettingsDto;
}
