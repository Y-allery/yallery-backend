import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class SetContestWinnerDto {
  @IsNumber()
  @ApiProperty({
    default: 1,
    type: Number,
  })
  post_id: number;

  @IsNumber()
  @ApiProperty({
    default: 1,
    type: Number,
  })
  contest_id: number;
}
