import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { PARTNER_PLAYGROUND_HTML } from './partner-playground.page';

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
    return PARTNER_PLAYGROUND_HTML;
  }
}
