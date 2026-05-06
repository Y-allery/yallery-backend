import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export enum PublicFineTunePresetEnum {
  XOOB = 'xoob',
  NOMISMA = 'nomisma',
}

export class PublicFineTuneGenerateRequestDto {
  @ApiProperty({
    description:
      'Prompt for the fine-tuned model. Fine-tune preset is selected via `preset`.',
    example: 'A cinematic portrait photo of a cyberpunk samurai, ultra-detailed, 85mm lens',
  })
  @IsString()
  prompt: string;

  @ApiPropertyOptional({
    description: [
      'Fine-tune preset selector. Kept for backwards compatibility; generation currently always uses the trained Nomisma RunPod LoRA.',
      '',
      '**Effective model:**',
      '- `nomisma` → `nomisma_style_8acd427f`',
    ].join('\n'),
    enum: PublicFineTunePresetEnum,
    default: PublicFineTunePresetEnum.NOMISMA,
    example: PublicFineTunePresetEnum.NOMISMA,
  })
  @IsOptional()
  @IsEnum(PublicFineTunePresetEnum)
  preset?: PublicFineTunePresetEnum;

  @ApiProperty({
    description: 'How many images to generate in a single request.',
    minimum: 1,
    maximum: 10,
    example: 2,
  })
  @IsInt()
  @Min(1)
  @Max(10)
  imageQuantity: number;
}

export class PublicFineTuneGenerateResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({
    description: 'Cloudinary URLs of generated images (already uploaded).',
    type: [String],
    example: [
      'https://res.cloudinary.com/demo/image/upload/v123/octoai_images/abc.jpg',
      'https://res.cloudinary.com/demo/image/upload/v123/octoai_images/def.jpg',
    ],
  })
  images: string[];

  @ApiProperty({
    description: 'RunPod LoRA key used for generation.',
    example: 'nomisma_style_8acd427f',
  })
  fineTuneToken: string;

  @ApiProperty({
    description: 'Underlying provider endpoint.',
    example: 'runpod/6fka********4v5x',
  })
  providerModel: string;

  @ApiProperty({
    description: 'Generation time in milliseconds (best-effort).',
    example: 7421,
  })
  elapsedMs: number;
}

