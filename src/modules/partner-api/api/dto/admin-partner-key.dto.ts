import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePartnerKeyDto {
  @ApiProperty({ description: 'Who the key is for.', example: 'Acme Studio' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({
    description:
      'Attach the key to a partner account, so its calls are billed to that balance. ' +
      'Omit for an internal key with no balance check.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  accountId?: number;

  @ApiPropertyOptional({
    description: 'Requests per minute. Omit for the service default of 60.',
    minimum: 1,
    maximum: 120,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  rateLimitPerMinute?: number;

  @ApiPropertyOptional({
    description:
      'Days until the key stops working. Omit for a key that never expires.',
    minimum: 1,
    maximum: 365,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number;
}

export class TopUpAccountDto {
  @ApiProperty({
    description: 'Account id from GET /admin/partner-api/accounts.',
  })
  @IsInt()
  @Min(1)
  accountId: number;

  @ApiProperty({
    description: 'USD to add. Negative subtracts, recorded as an adjustment.',
    example: 50,
  })
  @IsNumber()
  @Min(-100000)
  @Max(100000)
  amountUsd: number;

  @ApiPropertyOptional({
    description: 'Shown to the partner in their balance history.',
    example: 'Invoice #4 paid',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class RevokePartnerKeyDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  id: number;
}
