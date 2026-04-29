import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ContestCandidateRejectDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiProperty({
    required: false,
    type: String,
    description: 'Optional admin-visible rejection reason.',
  })
  reason?: string;
}

export class ContestNoWinnerDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ApiProperty({
    required: false,
    type: String,
    description: 'Optional admin-visible no-winner reason.',
  })
  reason?: string;
}
