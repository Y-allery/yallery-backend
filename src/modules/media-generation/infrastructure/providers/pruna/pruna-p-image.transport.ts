export type PrunaHttpMethod = 'GET' | 'POST';

export interface PrunaHttpRequest {
  method: PrunaHttpMethod;
  url: string;
  headers: Readonly<Record<string, string>>;
  body?: string;
  timeoutMs: number;
  maxResponseBytes: number;
  redirect: 'manual';
}

export interface PrunaHttpResponse {
  status: number;
  headers: Readonly<Record<string, string | undefined>>;
  body: Buffer;
}

export interface PrunaHttpTransport {
  request(request: Readonly<PrunaHttpRequest>): Promise<PrunaHttpResponse>;
}

export type PrunaTransportFailureKind =
  | 'timeout'
  | 'network'
  | 'response_too_large';

/**
 * A transport failure intentionally carries no cause, URL, headers or response
 * bytes. Those values can contain the API key, prompt or delivery capability.
 */
export class PrunaTransportFailure extends Error {
  constructor(readonly kind: PrunaTransportFailureKind) {
    super(`PRUNA_TRANSPORT_${kind.toUpperCase()}`);
    this.name = 'PrunaTransportFailure';
  }
}

/**
 * Production-capable transport with redirects disabled and a streaming byte
 * cap. It is not wired into the application module; tests inject a fake
 * transport and make no external requests.
 */
export class FetchPrunaHttpTransport implements PrunaHttpTransport {
  async request(
    request: Readonly<PrunaHttpRequest>,
  ): Promise<PrunaHttpResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);

    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: { ...request.headers },
        body: request.body,
        redirect: request.redirect,
        signal: controller.signal,
      });
      const declaredLength = parseContentLength(
        response.headers.get('content-length'),
      );

      if (
        declaredLength !== undefined &&
        declaredLength > request.maxResponseBytes
      ) {
        throw new PrunaTransportFailure('response_too_large');
      }

      const chunks: Buffer[] = [];
      let byteLength = 0;
      const reader = response.body?.getReader();

      if (reader) {
        while (true) {
          const result = await reader.read();
          if (result.done) {
            break;
          }

          const chunk = Buffer.from(result.value);
          byteLength += chunk.byteLength;
          if (byteLength > request.maxResponseBytes) {
            await reader.cancel();
            throw new PrunaTransportFailure('response_too_large');
          }
          chunks.push(chunk);
        }
      }

      return {
        status: response.status,
        headers: {
          'content-type': response.headers.get('content-type') || undefined,
          'content-length': response.headers.get('content-length') || undefined,
          'retry-after': response.headers.get('retry-after') || undefined,
        },
        body: Buffer.concat(chunks, byteLength),
      };
    } catch (error) {
      if (error instanceof PrunaTransportFailure) {
        throw error;
      }
      if (
        controller.signal.aborted ||
        (error instanceof Error &&
          (error.name === 'AbortError' || error.name === 'TimeoutError'))
      ) {
        throw new PrunaTransportFailure('timeout');
      }
      throw new PrunaTransportFailure('network');
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseContentLength(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}
