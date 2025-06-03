import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class PaginatioDto {
  @ApiProperty({
    description: 'Page number of the results',
    example: 1,
    required: false,
  })
  @IsOptional()
  page: number = 1;

  @ApiProperty({
    description: 'Number of results per page',
    example: 10,
    required: false,
  })
  @IsOptional()
  limit: number = 10;
}
