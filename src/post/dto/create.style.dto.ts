import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateStyleDto {
  @ApiProperty({ example: 'Gothic' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 'gothic', required: false })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiProperty({ example: 'http://example.com/image.jpg' })
  @IsNotEmpty()
  @IsString()
  imageUrl: string;
}
