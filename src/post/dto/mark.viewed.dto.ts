import { IsArray, ArrayNotEmpty, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class MarkViewedDto {
  @ApiProperty({
    description: 'Array of post IDs to mark as viewed',
    type: [Number],
    example: [1, 2, 3, 4],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Type(() => Number)
  ids: number[];
}
