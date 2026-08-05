import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class PartnerSignUpDto {
  @ApiProperty({ example: 'dev@acme.com' })
  @IsEmail()
  @MaxLength(190)
  email: string;

  @ApiProperty({ minLength: 10, description: 'At least 10 characters.' })
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  password: string;

  @ApiPropertyOptional({ example: 'Acme Studio' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  company?: string;
}

export class PartnerSignInDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(190)
  email: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  password: string;
}

export class PartnerChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  currentPassword: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  newPassword: string;
}

export class CreateOwnKeyDto {
  @ApiPropertyOptional({
    description: 'Label so you can tell your keys apart.',
    example: 'production',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

export class RevokeOwnKeyDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  id: number;
}
