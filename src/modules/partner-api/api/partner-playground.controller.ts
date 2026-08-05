import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import {
  PARTNER_MODELS,
  describePartnerModel,
} from '../domain/partner-model.catalog';
import { renderPartnerPlayground } from './partner-playground.page';
import { PARTNER_PORTAL_HTML } from './partner-portal.page';

/**
 * The two browser pages: the playground and the customer console.
 *
 * Both are public HTML; each authenticates its own calls — the playground with the key the
 * partner pastes in, the console with a session it obtains itself. Neither page carries a
 * credential of ours.
 */
@ApiExcludeController()
@Controller()
export class PartnerPlaygroundController {
  @Get('v1/playground')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  playground(): string {
    // The public projection, same as GET /v1/models — the page must not carry the
    // backend or our cost into a partner's browser.
    return renderPartnerPlayground(PARTNER_MODELS.map(describePartnerModel));
  }

  @Get('portal')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  portal(): string {
    return PARTNER_PORTAL_HTML;
  }
}
