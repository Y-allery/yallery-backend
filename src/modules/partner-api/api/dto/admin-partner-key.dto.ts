import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreatePartnerKeyDto {
  @ApiProperty({ description: 'Who the key is for.', example: 'Acme Studio' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({
    description: 'Requests per minute. Omit for the service default of 60.',
    minimum: 1,
    maximum: 600,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  rateLimitPerMinute?: number;
}

export class RevokePartnerKeyDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  id: number;
}
