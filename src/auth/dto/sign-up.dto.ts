import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';

export class SignUpDto {
  @ApiProperty({ description: 'The name of the user', example: 'John Doe' })
  @IsString()
  @Length(2, 30)
  name: string;

  @ApiProperty({
    description: 'The username for the user',
    example: 'johnnydoe',
  })
  @IsString()
  @Length(3, 20)
  nickname: string;

  @ApiProperty({
    description: 'The email of the user',
    example: 'john.doe@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'The password for the user account',
    example: 'SecurePassword123!',
    minLength: 8,
    maxLength: 128,
    pattern: '/((?=.*\\d)|(?=.*\\W+))(?![.\\n])(?=.*[A-Z])(?=.*[a-z]).*/',
  })
  @IsString()
  @Length(8, 128)
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message:
      'Password must include one uppercase, one lowercase, one number, and one special character',
  })
  password: string;

  @ApiPropertyOptional({ description: 'Referral token from partnership link', example: '7d4b2eec...' })
  @IsOptional()
  @IsString()
  ref?: string;

  @ApiPropertyOptional({ description: 'Partner user id from external partner', example: 'partner-12345' })
  @IsOptional()
  @IsString()
  puid?: string;
}
