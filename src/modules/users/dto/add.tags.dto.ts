import { IsArray, ArrayNotEmpty, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddTagsDto {
  @ApiProperty({
    description: 'Array of tag IDs to add to the user',
    example: [1, 2, 3],
    type: [Number],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  tagIds: number[];
}
