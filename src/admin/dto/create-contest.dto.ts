import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ContestStatusEnum } from 'src/contest/types/contest.status.enum';

export class CreateContestDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @ApiProperty({
    default: 'Dominos',
    type: String,
  })
  name: string;

  @IsString()
  @ApiProperty({
    default:
      'https://images.squarespace-cdn.com/content/v1/5ede2122e582b96630a4a73e/1609375769634-EG1WOTIN7Y4MB01N8AV1/Domino%E2%80%99s-logo-2021.jpg',
    type: String,
  })
  imageUrl: string;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  @ApiProperty({
    default: `Create AI-generated images that creatively integrate Dominos Pizza into everyday settings. Open to all digital artists and AI enthusiasts. Show us your unique vision of Domino's in daily life!`,
    type: String,
  })
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiProperty({
    default: `Token for fal ai fine tune`,
    type: String,
    nullable: true,
  })
  examplePrompt: string;

  @IsNumber()
  @ApiProperty({
    default: 300,
    type: Number,
  })
  reward: number;

  @IsDateString()
  @ApiProperty({
    type: Date,
  })
  start_time: Date;

  @IsDateString()
  @ApiProperty({
    type: Date,
  })
  end_time: Date;

  @IsNumber()
  @ApiProperty({
    default: 1,
    type: Number,
  })
  tag_id: number;

  @IsEnum(ContestStatusEnum)
  @ApiProperty({
    default: ContestStatusEnum.CLOSED,
    type: 'enum',
    enum: ContestStatusEnum,
  })
  status: ContestStatusEnum;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(100)
  @ApiProperty({
    default: `Token for fal ai fine tune`,
    type: String,
    nullable: true,
  })
  fineTuneToken: string | null;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(100)
  @ApiProperty({
    default: `Token for fal ai fine tune`,
    type: String,
    nullable: true,
  })
  fineTuneTriggerWord: string | null;

  @IsNumber()
  @Max(2)
  @Min(0)
  @IsOptional()
  @ApiProperty({
    default: 1,
    type: Number,
    nullable: true,
  })
  fineTuneStrength: number | null;
}
