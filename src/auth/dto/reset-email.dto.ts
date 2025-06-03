import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class RequestChangeEmailDto {
  @ApiProperty({
    description: 'The current email of the user',
    example: 'user@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  currentEmail: string;
}

export class ConfirmChangeEmailDto {
  @ApiProperty({
    description: 'The token received to confirm the email change',
    example: '12345678-abcd-efgh-ijkl-1234567890ab',
  })
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    description: 'The new email to be confirmed',
    example: 'newuser@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  newEmail: string;
}
