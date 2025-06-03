import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsNotEmpty,
  IsNumberString,
  IsDate,
  IsPositive,
  Min,
} from 'class-validator';

export class TelegramLoginDto {
  @ApiProperty({ description: 'Telegram ID', example: '534108635' })
  @IsInt()
  @IsPositive()
  id: number;

  @ApiProperty({ description: 'First name of the user', example: 'Artem' })
  @IsString()
  @IsNotEmpty()
  first_name: string;

  @ApiProperty({
    description: 'Last name of the user',
    example: 'Ivanov',
    required: false,
  })
  @IsOptional()
  @IsString()
  last_name?: string;

  @ApiProperty({
    description: 'Username of the user',
    example: 'ortem1917',
    required: false,
  })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({ description: 'Language code', example: 'en', required: false })
  @IsOptional()
  @IsString()
  language_code?: string;

  @ApiProperty({
    description: 'Hash of the data to verify the integrity',
    example: 'abc123hash',
  })
  @IsString()
  @IsNotEmpty()
  hash: string;

  @ApiProperty({
    description: 'Auth date in seconds',
    example: 1729779671,
    nullable: true,
  })
  @IsInt()
  @IsOptional()
  @Min(1)
  auth_date: number | null = null;
}
