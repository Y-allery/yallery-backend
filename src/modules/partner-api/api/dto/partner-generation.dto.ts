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
import { MAX_URL_LENGTH, isPublicHttpUrl } from '../../domain/public-url';

/**
 * Reference images arrive as URLs we or the upstream will fetch, which makes an
 * unvalidated one a request forgery primitive. Public http(s) only, and no address that
 * resolves inside a private range by its literal form.
 */
@ValidatorConstraint({ name: 'publicImageUrl' })
export class IsPublicImageUrl implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return Array.isArray(value)
      ? value.every(isPublicHttpUrl)
      : isPublicHttpUrl(value);
  }

  defaultMessage(): string {
    return 'must be a publicly reachable http(s) image URL';
  }
}

/** Same rule, different noun: this one is an address we POST to rather than fetch from. */
@ValidatorConstraint({ name: 'partnerCallbackUrl' })
export class IsPartnerCallbackUrl implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isPublicHttpUrl(value);
  }

  defaultMessage(): string {
    return 'must be a publicly reachable http(s) URL';
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

  @ApiPropertyOptional({
    description:
      'Where to POST the result. Supplying it switches the call to asynchronous: the ' +
      'request answers 202 with a job id straight away and the finished generation is ' +
      'delivered to this URL. Omit it to keep waiting for the result inline.',
    example: 'https://example.com/hooks/yallery',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_URL_LENGTH)
  @Validate(IsPartnerCallbackUrl)
  callback_url?: string;
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
  @ApiPropertyOptional({
    description:
      'URL of the still image to animate. Required by the image-to-video models and ' +
      'refused by the text-to-video ones, which draw their own opening frame.',
    example: 'https://example.com/photo.jpg',
  })
  @IsOptional()
  @IsString()
  @Validate(IsPublicImageUrl)
  image?: string;
}
