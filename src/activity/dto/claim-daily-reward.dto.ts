import { ApiProperty } from '@nestjs/swagger';

export class ClaimDailyRewardResponseDto {
  @ApiProperty({
    description: 'Whether the daily reward was successfully claimed',
    example: true
  })
  success: boolean;

  @ApiProperty({
    description: 'Message describing the result of the claim attempt',
    example: 'Successfully claimed daily reward of 10 YEPs!'
  })
  message: string;

  @ApiProperty({
    description: 'Number of YEPs awarded (0 if already claimed today)',
    example: 10
  })
  pointsAwarded: number;
}
