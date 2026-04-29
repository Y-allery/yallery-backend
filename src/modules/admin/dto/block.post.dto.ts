import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class BlockPostDto {
  @IsNumber()
  @ApiProperty({
    default: 1,
    type: Number,
  })
  post_id: number;
}
