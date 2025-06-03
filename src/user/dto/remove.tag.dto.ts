import { ApiProperty } from '@nestjs/swagger';

export class RemoveTagDto {
  @ApiProperty({
    description: 'The ID of the tag to remove from the user',
    example: 123,
    type: Number,
  })
  tagId: number;
}
