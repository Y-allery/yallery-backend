import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { SUPPORTED_LOCALES } from 'src/modules/translations/translation.catalog';

export class UpdateLanguageDto {
  @ApiProperty({ enum: SUPPORTED_LOCALES, example: 'uk' })
  @IsIn(SUPPORTED_LOCALES as unknown as string[])
  language: string;
}
