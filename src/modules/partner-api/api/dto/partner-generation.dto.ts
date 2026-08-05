import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const PRIVATE_HOST = new RegExp(
  [
    '^localhost$',
    '^127\\.',
    '^0\\.',
    '^10\\.',
    '^192\\.168\\.',
    '^169\\.254\\.',
    '^172\\.(1[6-9]|2\\d|3[01])\\.',
    '^\\[?::1\\]?$',
    '^\\[?f[cd]',
    '\\.internal$',
    '\\.local$',
  ].join('|'),
  'i',
);

/**
 * Reference images arrive as URLs we or the upstream will fetch, which makes an
 * unvalidated one a request forgery primitive. Public http(s) only, and no address that
 * resolves inside a private range by its literal form.
 */
@ValidatorConstraint({ name: 'publicImageUrl' })
export class IsPublicImageUrl implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    const check = (candidate: unknown) => {
      if (typeof candidate !== 'string' || candidate.length > 2048) return false;
      let parsed: URL;
      try {
        parsed = new URL(candidate);
      } catch {
        return false;
      }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return false;
      }
      return !PRIVATE_HOST.test(parsed.hostname);
    };
    return Array.isArray(value) ? value.every(check) : check(value);
  }

  defaultMessage(): string {
    return 'must be a publicly reachable http(s) image URL';
  }
}

class BasePartnerGenerationDto {
  @ApiProperty({
    description: 'Model id from GET /v1/models.',
    example: 'yengine-photo',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  model: string;

  @ApiProperty({
    description: 'What to generate. English gives the most reliable results.',
    example: 'a red sports car on a coastal road at sunset',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  prompt: string;

  @ApiPropertyOptional({
    description:
      'Output size. Allowed values differ per model — see GET /v1/models. Defaults to the first supported size.',
    example: '1024x1024',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  size?: string;

  @ApiPropertyOptional({
    description:
      'Seed for reproducibility. The same seed, prompt and model give the same image.',
    minimum: 0,
    maximum: 4294967295,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4294967295)
  seed?: number;
}

export class PartnerImageGenerationDto extends BasePartnerGenerationDto {
  @ApiPropertyOptional({
    description: 'How many images to generate. Each one is billed.',
    minimum: 1,
    maximum: 4,
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  n?: number;
}

export class PartnerImageEditDto extends PartnerImageGenerationDto {
  @ApiProperty({
    description:
      'Reference image URLs, 1 to 3. The first is the image being edited; any others supply a subject or style to compose in. Accepts a single string too.',
    type: [String],
    example: ['https://example.com/photo.jpg'],
  })
  @Transform(({ value }) => (typeof value === 'string' ? [value] : value))
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @Validate(IsPublicImageUrl)
  images: string[];
}

export class PartnerVideoGenerationDto extends BasePartnerGenerationDto {
  @ApiProperty({
    description: 'URL of the still image to animate.',
    example: 'https://example.com/photo.jpg',
  })
  @IsString()
  @Validate(IsPublicImageUrl)
  image: string;
}
