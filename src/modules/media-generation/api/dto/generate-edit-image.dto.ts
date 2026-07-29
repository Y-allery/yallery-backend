import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  ValidateIf,
} from 'class-validator';
import { MAX_EDIT_REFERENCE_IMAGES } from 'src/modules/media-generation/domain/constants/image-edit.constants';

export class GenerateEditImageDto {
  @IsString()
  @ApiProperty({
    description: 'Prompt describing how the source image should be edited.',
    example: 'Change hair color to red and background to New York city.',
  })
  prompt: string;

  @IsString()
  @ApiProperty({
    description: 'Requested AI service/model identifier.',
    example: 'qwen_image_edit_baked',
  })
  ai_service: string;

  /**
   * Legacy single-image field. Still the only thing shipped app builds send, so it stays
   * accepted; it is treated as `image_urls[0]` when `image_urls` is absent. Required only when
   * `image_urls` is empty, which preserves the exact 400 those clients would get today.
   */
  @ValidateIf((dto: GenerateEditImageDto) => !dto.image_urls?.length)
  @IsUrl()
  @ApiPropertyOptional({
    description:
      'Source image URL to edit. Deprecated alias for `image_urls[0]` — kept for existing clients. Required when `image_urls` is not provided.',
    example: 'https://example.com/source-image.jpg',
  })
  image_url?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_EDIT_REFERENCE_IMAGES)
  @IsUrl({}, { each: true })
  @ApiPropertyOptional({
    type: [String],
    maxItems: MAX_EDIT_REFERENCE_IMAGES,
    description:
      "Reference images, 1-3. The FIRST image is the one being edited (the canvas); the others are additional references supplying a subject, object or style to compose into it. The result always keeps the first image's framing, and exactly one image is returned. Takes precedence over `image_url`.",
    example: [
      'https://example.com/person.jpg',
      'https://example.com/jacket.jpg',
    ],
  })
  image_urls?: string[];

  @IsOptional()
  @IsInt()
  @ApiPropertyOptional({
    description:
      'Optional style ID. When provided, the backend enriches the edit prompt with the selected style.',
    example: 12,
  })
  style_id?: number;

  @IsOptional()
  @IsInt()
  @ApiPropertyOptional({
    description:
      'Optional color ID. When provided, the backend enriches the edit prompt with the selected color direction.',
    example: 3,
  })
  color_id?: number;

  @IsOptional()
  @IsInt()
  @ApiPropertyOptional({
    description:
      'Optional contest ID. When present, edited images are attached to the contest flow.',
    example: 12,
  })
  contest_id?: number;
}
