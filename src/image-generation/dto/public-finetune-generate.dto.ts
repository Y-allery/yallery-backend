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
      'Fine-tune preset selector.',
      '',
      '**Available:**',
      '- `xoob` → `fca9b669-380a-4d5e-873b-ac0b116c82a0`',
      '- `nomisma` → `62a50ee2-5e66-4fe2-ad6b-64cead6834e8`',
    ].join('\n'),
    enum: PublicFineTunePresetEnum,
    default: PublicFineTunePresetEnum.XOOB,
    example: PublicFineTunePresetEnum.XOOB,
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
    description: 'Fine-tune token used for generation (selected by preset).',
    example: 'fca9b669-380a-4d5e-873b-ac0b116c82a0',
  })
  fineTuneToken: string;

  @ApiProperty({
    description: 'Underlying provider model name taken from AI settings.',
    example: 'fal-ai/black-forest-labs/flux-pro/v1.1',
  })
  providerModel: string;

  @ApiProperty({
    description: 'Generation time in milliseconds (best-effort).',
    example: 7421,
  })
  elapsedMs: number;
}


