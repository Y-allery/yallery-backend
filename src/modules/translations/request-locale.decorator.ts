import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { parseAcceptLanguage, SupportedLocale } from './translation.catalog';

/**
 * Resolves the client's preferred supported locale from the Accept-Language
 * header (sent by the mobile app as its active easy_localization locale).
 * Returns null when the header is missing/unsupported — callers then serve
 * the original (source) content.
 */
export const RequestLocale = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SupportedLocale | null => {
    const request = context.switchToHttp().getRequest<Request>();
    return parseAcceptLanguage(request.headers['accept-language']);
  },
);
