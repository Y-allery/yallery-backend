import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class LogReferralActivityDto {
  @ApiProperty({ example: 'registration' })
  @IsString()
  activity: string;

  @ApiProperty({ example: 'd91a7e56-1234-4f9e-bb8a-d1c93251f9cd' })
  @IsString()
  referralToken: string;
}
