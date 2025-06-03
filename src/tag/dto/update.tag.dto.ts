// src/tag/dto/update-tag.dto.ts

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class UpdateTagDto {
  @ApiProperty({
    description: 'Name of the tag',
    example: 'Updated Nature',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description: 'Image URL for the tag',
    example: 'http://example.com/updated-image.png',
    required: false,
  })
  @IsOptional()
  @IsString()
  imageUrl?: string;
}
