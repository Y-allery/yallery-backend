import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt.auth.guard';
import { MemeService } from './meme.service';
import { ContentTranslationService } from 'src/modules/translations/content-translation.service';
import { RequestLocale } from 'src/modules/translations/request-locale.decorator';
import {
  SupportedLocale,
  TRANSLATABLE_FIELDS,
} from 'src/modules/translations/translation.catalog';

@ApiTags('Meme')
@Controller('memes')
export class MemeController {
  constructor(
    private readonly memeService: MemeService,
    private readonly contentTranslationService: ContentTranslationService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'List memes: popular (top 6 by generations this month) + regular, with generationsCount',
  })
  @ApiResponse({
    status: 200,
    description:
      '{ popular: Meme[], regular: Meme[] }; each meme has generationsCount',
  })
  async listAvailable(@RequestLocale() locale: SupportedLocale | null) {
    const result = await this.memeService.listForApp();
    const [popular, regular] = await Promise.all([
      this.contentTranslationService.resolveMany(
        'meme',
        locale,
        result.popular ?? [],
        TRANSLATABLE_FIELDS.meme,
      ),
      this.contentTranslationService.resolveMany(
        'meme',
        locale,
        result.regular ?? [],
        TRANSLATABLE_FIELDS.meme,
      ),
    ]);
    return { ...result, popular, regular };
  }
}
