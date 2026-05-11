import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class BlockUserDto {
  @IsNumber()
  @ApiProperty({
    default: 1,
    type: Number,
  })
  user_id: number;
}
