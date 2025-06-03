import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateTwitterUsernameDto {
  @ApiProperty({
    example: 'crypto_enthusiast',
    description:
      'Twitter username without @, only letters, numbers, and underscores. Max 15 characters.',
  })
  @IsString()
  @MinLength(1, {
    message: 'Twitter username must be at least 1 character long.',
  })
  @MaxLength(15, {
    message: 'Twitter username cannot be longer than 15 characters.',
  })
  twitterUsername: string;
}
