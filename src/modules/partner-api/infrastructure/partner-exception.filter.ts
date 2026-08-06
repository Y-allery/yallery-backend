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
  402: 'quota_exceeded',
  403: 'authentication_error',
  404: 'invalid_request_error',
  413: 'invalid_request_error',
  429: 'rate_limit_error',
};

/**
 * Whether this exception was built by us for a partner to read.
 *
 * The test is the nested `type`, not the class: a great deal of the code this module calls
 * throws HttpExceptions of its own — the RunPod client's carry the vendor name, the job id
 * and its raw output — and treating those as partner-facing puts all of it in the response.
 */
export interface PartnerErrorEnvelope {
  type: string;
  message: string;
  param?: string;
}

/** The envelope if this exception carries one, otherwise null. */
export const partnerErrorEnvelope = (
  error: unknown,
): PartnerErrorEnvelope | null => {
  if (!(error instanceof HttpException)) return null;
  const body = error.getResponse();
  if (typeof body !== 'object' || body === null) return null;
  const envelope = (body as Record<string, unknown>)['error'];
  if (
    typeof envelope !== 'object' ||
    envelope === null ||
    typeof (envelope as Record<string, unknown>)['type'] !== 'string'
  ) {
    return null;
  }
  const { type, message, param } = envelope as Record<string, unknown>;
  return {
    type: type as string,
    message: typeof message === 'string' ? message : '',
    ...(typeof param === 'string' && { param }),
  };
};

export const isPartnerFacingError = (error: unknown): boolean =>
  partnerErrorEnvelope(error) !== null;

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
