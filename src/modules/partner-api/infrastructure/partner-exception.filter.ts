import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

const TYPE_BY_STATUS: Record<number, string> = {
  400: 'invalid_request_error',
  401: 'authentication_error',
  403: 'authentication_error',
  404: 'invalid_request_error',
  413: 'invalid_request_error',
  429: 'rate_limit_error',
};

/**
 * Gives every partner-facing failure the one error shape the docs promise.
 *
 * Without it the global ValidationPipe answers in Nest's own `{message: [...], error,
 * statusCode}` shape, so a partner would have to parse two formats — and the one they
 * would hit first, on their very first malformed request, is the undocumented one.
 */
@Catch()
export class PartnerExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PartnerExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();

    if (!(exception instanceof HttpException)) {
      this.logger.error(
        'unhandled partner API error',
        (exception as Error)?.stack ?? String(exception),
      );
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: {
          type: 'generation_error',
          message: 'Internal error. Retry; if it persists, contact support.',
        },
      });
      return;
    }

    const status = exception.getStatus();
    const body = exception.getResponse() as Record<string, unknown> | string;

    // Already in our shape: thrown deliberately, keep every field. Nest's own bodies also
    // carry an `error` key, but it holds the status text ("Bad Request") rather than an
    // object, so the check has to look for the nested `type` and not merely the key.
    const envelope =
      typeof body === 'object' && body !== null
        ? (body['error'] as { type?: unknown } | undefined)
        : undefined;
    if (envelope && typeof envelope === 'object' && 'type' in envelope) {
      response.status(status).json(body);
      return;
    }

    const raw =
      typeof body === 'object' && body !== null ? body['message'] : body;
    const message = Array.isArray(raw)
      ? raw.join('; ')
      : String(raw ?? exception.message);

    response.status(status).json({
      error: {
        type: TYPE_BY_STATUS[status] ?? 'generation_error',
        message,
      },
    });
  }
}
