import { IsNumber, IsOptional, IsBoolean, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateRewardDto {
  @ApiProperty({
    description: 'Number of points for this reward',
    example: 100,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  points?: number;

  @ApiProperty({
    description: 'Description of the reward',
    example: 'Daily reward for active users',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Whether the reward is active',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
