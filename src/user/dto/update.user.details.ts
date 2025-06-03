import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateAvatarDto {
  @ApiProperty({
    description: 'URL of the user avatar',
    example: 'https://example.com/avatar.jpg',
  })
  @IsString()
  @IsNotEmpty()
  avatar: string;
}

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Old password of the user',
    example: 'oldpassword123',
  })
  @IsString()
  @IsNotEmpty()
  oldPassword: string;

  @ApiProperty({
    description: 'New password for the user',
    example: 'newpassword123',
  })
  @IsString()
  @IsNotEmpty()
  newPassword: string;
}

export class UpdateNameDto {
  @ApiProperty({
    description: 'New name of the user',
    example: 'John Doe',
  })
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class UpdateNicknameDto {
  @ApiProperty({
    description: 'New nickname of the user',
    example: 'johnny',
  })
  @IsString()
  @IsNotEmpty()
  nickname: string;
}
