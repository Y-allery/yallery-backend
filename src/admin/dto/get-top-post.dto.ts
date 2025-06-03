import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class GetTopPostDto {
  @IsString()
  @ApiProperty({
    default: '1',
    type: String,
  })
  contest_id: string;

  @IsString()
  @ApiProperty({
    default: '1',
    type: String,
    description: 'Page number of the results',
  })
  page: number;

  @IsString()
  @ApiProperty({
    default: '5',
    type: String,
    description: 'Number of results per page',
  })
  limit: number;
}
