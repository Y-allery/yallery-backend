

import { ApiProperty } from '@nestjs/swagger';

export class GetAllReportsDto {
  @ApiProperty({
    description: 'Page number of the results',
    example: 1,
    required: false,
  })
  page: number = 1;

  @ApiProperty({
    description: 'Number of results per page',
    example: 10,
    required: false,
  })
  limit: number = 10;
}
