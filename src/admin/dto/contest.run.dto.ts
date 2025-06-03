import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class ContestRunDto {
  @IsNumber()
  @ApiProperty({
    default: 1,
    type: Number,
  })
  contest_id: number;
}
