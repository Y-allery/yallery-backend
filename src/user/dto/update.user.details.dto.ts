import {
  IsString,
  Length,
  Matches,
  IsOptional,
  IsEmail,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiProperty({
    description: 'New password for the user account',
    example: 'SecurePassword123!',
    minLength: 8,
    maxLength: 128,
  })
  @IsString()
  @Length(8, 128)
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message:
      'Password must include one uppercase, one lowercase, one number, and one special character',
  })
  @IsOptional()
  password?: string;

  @ApiPropertyOptional({
    description: 'New nickname for the user.',
    example: 'CoolNickname',
  })
  @IsString()
  @IsOptional()
  nickname?: string;

  @ApiPropertyOptional({
    description: 'New name for the user.',
    example: 'John Doe',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'New email for the user.',
    example: 'user@example.com',
  })
  @IsEmail()
  @IsOptional()
  email?: string;
}
