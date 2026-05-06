import { IsNumber, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForceStartContestDto {
  @ApiProperty({
    description: 'ID of the contest to force start',
    example: 1,
    minimum: 1,
  })
  @IsNumber()
  @IsPositive()
  contestId: number;
}

