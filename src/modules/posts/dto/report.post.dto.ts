import { IsNotEmpty, IsString, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReportPostDto {
  @ApiProperty({
    description: 'ID of the post being reported',
    example: 123,
  })
  @IsNumber()
  @IsNotEmpty()
  readonly postId: number;

  @ApiProperty({
    description: 'Description of the reason for the report',
    example: 'This post contains inappropriate content',
  })
  @IsString()
  @IsNotEmpty()
  readonly description: string;
}
