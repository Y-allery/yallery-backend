// src/tag/dto/create-tag.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CreateTagDto {
  @ApiProperty({
    description: 'Name of the tag',
    example: 'Nature',
  })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Image URL for the tag',
    example: 'http://example.com/image.png',
    required: false,
  })
  @IsOptional()
  @IsString()
  imageUrl?: string;
}
