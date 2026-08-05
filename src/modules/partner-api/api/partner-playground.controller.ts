import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  PARTNER_MODELS,
  describePartnerModel,
} from '../domain/partner-model.catalog';
import { renderPartnerPlayground } from './partner-playground.page';

/**
 * The page itself is public; every call it makes still needs the partner's own key, which
 * they paste in and which never leaves their browser.
 */
@ApiExcludeController()
@Controller('v1')
export class PartnerPlaygroundController {
  @Get('playground')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  playground(): string {
    // The public projection, same as GET /v1/models — the page must not carry the
    // backend or our cost into a partner's browser.
    return renderPartnerPlayground(PARTNER_MODELS.map(describePartnerModel));
  }
}
