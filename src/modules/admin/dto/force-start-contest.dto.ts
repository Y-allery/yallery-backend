import { IsNumber, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ForceStartContestDto {
  @ApiProperty({
    description: 'ID of the contest to force start',
    example: 1,
    minimum: 1,
  })
  // Callers routinely take the id straight from a route param, i.e. a string.
  // Without this the global ValidationPipe rejects "148" with a 400 before the
  // controller ever runs, so the failure never reaches a log and reads as an
  // unexplained error client-side.
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  contestId: number;
}

