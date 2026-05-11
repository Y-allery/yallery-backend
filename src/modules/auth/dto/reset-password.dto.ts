import { IsEmail, IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Reset token sent to the user email',
    example: 'd7c4e8f4-3f7c-4e8c-b18f-5c9b6e9c6d4a',
  })
  @IsString()
  token: string;

  @ApiProperty({
    description: 'The new password for the user account',
    example: 'SecurePassword123!',
    minLength: 8,
    maxLength: 128,
    pattern: '/((?=.*\\d)|(?=.*\\W+))(?![.\\n])(?=.*[A-Z])(?=.*[a-z]).*/',
  })
  @IsString()
  @Length(8, 128)
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message:
      'Password must include one uppercase letter, one lowercase letter, one number, and one special character',
  })
  newPassword: string;
}

export class RequestResetPasswordDto {
  @ApiProperty({
    description: 'Email of the user requesting password reset',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: 'Invalid email address' })
  email: string;
}
