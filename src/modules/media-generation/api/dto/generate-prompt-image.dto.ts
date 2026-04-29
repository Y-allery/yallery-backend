import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { MEDIA_ORIENTATIONS, MediaOrientation } from 'src/modules/media-generation/domain/presets';

export class GeneratePromptImageDto {
  @IsString()
  @ApiProperty({
    description: 'Prompt text used to generate the image.',
  })
  prompt: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description:
      'Requested AI service/model identifier. Optional when contest_id is provided because the backend resolves the contest model automatically.',
    example: 'flux2_klein',
  })
  ai_service?: string;

  @IsIn(MEDIA_ORIENTATIONS)
  @ApiProperty({
    description: 'Requested output orientation.',
    enum: MEDIA_ORIENTATIONS,
    example: 'vertical',
  })
  orientation: MediaOrientation;

  @IsInt()
  @Min(1)
  @Max(4)
  @ApiProperty({
    description: 'Number of images to generate.',
    minimum: 1,
    maximum: 5,
    example: 1,
  })
  image_quantity: number;

  @IsOptional()
  @IsInt()
  @ApiPropertyOptional({
    description: 'Optional style ID. When provided, the backend enriches the prompt with the selected style.',
    example: 12,
  })
  style_id?: number;

  @IsOptional()
  @IsInt()
  @ApiPropertyOptional({
    description: 'Optional color ID. When provided, the backend enriches the prompt with the selected color direction.',
    example: 3,
  })
  color_id?: number;

  @IsOptional()
  @IsInt()
  @ApiPropertyOptional({
    description: 'Optional contest ID. When present, generated images are attached to the contest flow.',
    example: 12,
  })
  contest_id?: number;
}
