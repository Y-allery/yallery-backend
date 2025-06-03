import { IsInt, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignTagDto {
  @IsInt()
  @IsPositive()
  @ApiProperty({ description: 'ID of the post' })
  post_id: number;

  @IsInt()
  @IsPositive()
  @ApiProperty({ description: 'ID of the tag to assign to the post' })
  tag_id: number;
}
