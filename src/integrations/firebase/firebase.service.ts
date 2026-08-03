import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

export interface SendNotificationResult {
  success: boolean;
  /** FCM message id, on success. */
  response?: string;
  error?: any;
  /** The token is dead — callers delete it instead of retrying. */
  isInvalidToken?: boolean;
  /** The send failed for a transient reason and may be re-attempted later. */
  isRetryable?: boolean;
  /** How long the caller should wait before re-attempting, when known. */
  retryAfterMs?: number;
  /** Attempts actually made, for logging/metrics. */
  attempts: number;
}

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private firebaseApp: admin.app.App;

  /** A send that has not answered by now is treated as failed and retried. */
  private static readonly DEFAULT_TIMEOUT_MS = 10000;
  private static readonly DEFAULT_MAX_ATTEMPTS = 3;
  private static readonly BASE_BACKOFF_MS = 500;
  private static readonly MAX_BACKOFF_MS = 8000;

  /**
   * Google's guidance for QUOTA_EXCEEDED without a Retry-After header: wait at
   * least a minute before trying that message again.
   */
  private static readonly QUOTA_DEFAULT_RETRY_AFTER_MS = 60000;

  /**
   * Ceiling for sleeping inside the call. A 60s Retry-After honoured inline
   * would pin a queue worker for a minute per message, so anything longer is
   * handed back as `isRetryable` and left to the caller's own backoff — which
   * respects the delay without blocking a worker.
   */
  private static readonly MAX_INLINE_RETRY_DELAY_MS = 10000;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: this.configService.get<string>('FIREBASE_PROJECT_ID'),
        clientEmail: this.configService.get<string>('FIREBASE_CLIENT_EMAIL'),
        privateKey: this.configService
          .get<string>('FIREBASE_PRIVATE_KEY')
          ?.replace(/\\n/g, '\n'),
      }),
    });
  }

  /**
   * Sends one push, retrying the failures that are worth retrying.
   *
   * Every error used to be flattened into `{ success: false }`, so a 429
   * QUOTA_EXCEEDED or a 503 UNAVAILABLE — both explicitly retryable, and both
   * arriving in bursts exactly when traffic spikes — silently dropped the
   * message. Transient failures are now retried with exponential backoff and
   * jitter (jitter matters: without it every worker retries in lockstep and
   * re-creates the spike), and a Retry-After is honoured when FCM sends one.
   */
  async sendNotification(
    token: string,
    title: string,
    body: string,
    /**
     * Routing payload for the tap: the client reads `type` to decide which screen to
     * open and takes the rest as its parameters. FCM only carries strings here, so
     * numeric ids must be stringified by the caller.
     */
    data?: Record<string, string>,
  ): Promise<SendNotificationResult> {
    const message = {
      notification: {
        title,
        body,
      },
      ...(data && { data }),
      token,
    };

    const maxAttempts = this.getPositiveNumberConfig(
      'FCM_MAX_ATTEMPTS',
      FirebaseService.DEFAULT_MAX_ATTEMPTS,
    );
    const timeoutMs = this.getPositiveNumberConfig(
      'FCM_TIMEOUT_MS',
      FirebaseService.DEFAULT_TIMEOUT_MS,
    );

    let attempts = 0;

    while (true) {
      attempts++;
      try {
        const response = await this.withTimeout(
          this.firebaseApp.messaging().send(message),
          timeoutMs,
        );
        return { success: true, response, attempts };
      } catch (error) {
        const { isInvalidToken, isRetryable, retryAfterMs } =
          this.classifyError(error);

        if (isInvalidToken || !isRetryable || attempts >= maxAttempts) {
          this.logSendFailure(token, error, attempts, isRetryable);
          return {
            success: false,
            error,
            isInvalidToken,
            isRetryable: isRetryable && !isInvalidToken,
            retryAfterMs,
            attempts,
          };
        }

        const delayMs = this.getRetryDelayMs(attempts, retryAfterMs);
        if (delayMs > FirebaseService.MAX_INLINE_RETRY_DELAY_MS) {
          this.logger.warn(
            `FCM asked to back off ${delayMs}ms for token ${this.maskToken(
              token,
            )}; deferring to the caller after ${attempts} attempt(s)`,
          );
          return {
            success: false,
            error,
            isInvalidToken: false,
            isRetryable: true,
            retryAfterMs: delayMs,
            attempts,
          };
        }

        await this.sleep(delayMs);
      }
    }
  }

  /**
   * Invalid tokens are terminal (the caller deletes them); quota and
   * availability errors are transient. Codes AND message text are both checked
   * because firebase-admin reports the same condition either way depending on
   * whether the failure came from the v1 API or the transport underneath.
   */
  private classifyError(error: any): {
    isInvalidToken: boolean;
    isRetryable: boolean;
    retryAfterMs?: number;
  } {
    const errorCode: string = error?.code || '';
    const errorMessage: string = error?.message || '';
    const status = this.getStatusCode(error);

    const isInvalidToken =
      errorCode === 'messaging/registration-token-not-registered' ||
      errorCode === 'messaging/invalid-registration-token' ||
      errorMessage.includes('Requested entity was not found') ||
      errorMessage.includes('UNREGISTERED') ||
      errorMessage.includes('registration-token-not-registered') ||
      errorMessage.includes('invalid-registration-token');

    if (isInvalidToken) {
      return { isInvalidToken: true, isRetryable: false };
    }

    const isQuota =
      status === 429 ||
      errorCode === 'messaging/quota-exceeded' ||
      errorCode === 'messaging/message-rate-exceeded' ||
      errorCode === 'messaging/device-message-rate-exceeded' ||
      errorCode === 'messaging/topics-message-rate-exceeded' ||
      errorMessage.includes('QUOTA_EXCEEDED') ||
      errorMessage.includes('RESOURCE_EXHAUSTED');

    const isUnavailable =
      status === 500 ||
      status === 503 ||
      errorCode === 'messaging/server-unavailable' ||
      errorCode === 'messaging/internal-error' ||
      errorCode === 'messaging/unknown-error' ||
      errorMessage.includes('UNAVAILABLE') ||
      errorMessage.includes('INTERNAL') ||
      this.isTransportError(error);

    if (!isQuota && !isUnavailable) {
      return { isInvalidToken: false, isRetryable: false };
    }

    const retryAfterMs =
      this.parseRetryAfterMs(error) ??
      (isQuota ? FirebaseService.QUOTA_DEFAULT_RETRY_AFTER_MS : undefined);

    return { isInvalidToken: false, isRetryable: true, retryAfterMs };
  }

  /** Socket-level failures and our own timeout: nothing reached FCM. */
  private isTransportError(error: any): boolean {
    const code: string = error?.code || '';
    const message: string = error?.message || '';
    return (
      code === 'ECONNRESET' ||
      code === 'ETIMEDOUT' ||
      code === 'ECONNREFUSED' ||
      code === 'EAI_AGAIN' ||
      code === 'ENOTFOUND' ||
      message.includes('socket hang up') ||
      message.includes('ECONNRESET') ||
      message.includes('ETIMEDOUT') ||
      message.includes('timed out')
    );
  }

  private getStatusCode(error: any): number | undefined {
    const candidates = [
      error?.status,
      error?.statusCode,
      error?.httpErrorCode?.status,
      error?.httpErrorCode,
      error?.response?.status,
      error?.response?.statusCode,
    ];
    for (const candidate of candidates) {
      const status = Number(candidate);
      if (Number.isFinite(status) && status >= 100 && status < 600) {
        return status;
      }
    }
    return undefined;
  }

  /**
   * firebase-admin does not surface Retry-After on a fixed field, so the usual
   * places are probed. Both header forms are accepted: delta-seconds and an
   * HTTP-date.
   */
  private parseRetryAfterMs(error: any): number | undefined {
    const headers = error?.response?.headers;
    const raw =
      (typeof headers?.get === 'function'
        ? headers.get('retry-after')
        : undefined) ??
      headers?.['retry-after'] ??
      headers?.['Retry-After'] ??
      error?.retryAfter ??
      error?.errorInfo?.retryAfter;

    if (raw === undefined || raw === null || raw === '') {
      return undefined;
    }

    const seconds = Number(raw);
    if (Number.isFinite(seconds)) {
      return seconds > 0 ? Math.round(seconds * 1000) : undefined;
    }

    const date = Date.parse(String(raw));
    if (Number.isNaN(date)) {
      return undefined;
    }
    const deltaMs = date - Date.now();
    return deltaMs > 0 ? deltaMs : undefined;
  }

  /**
   * Equal jitter: half the window is fixed so retries never stampede back
   * immediately, half is random so concurrent workers spread out.
   */
  private getRetryDelayMs(attempt: number, retryAfterMs?: number): number {
    if (retryAfterMs !== undefined) {
      return retryAfterMs;
    }
    const cap = Math.min(
      FirebaseService.MAX_BACKOFF_MS,
      FirebaseService.BASE_BACKOFF_MS * 2 ** (attempt - 1),
    );
    return Math.round(cap / 2 + Math.random() * (cap / 2));
  }

  /**
   * The Firebase SDK has no per-call deadline, so a hung connection would hold
   * a queue worker until the socket died on its own.
   */
  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error(`FCM send timed out after ${ms}ms`)),
            ms,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
      // The losing send may still reject later; without this it surfaces as an
      // unhandled rejection.
      void promise.catch(() => undefined);
    }
  }

  private logSendFailure(
    token: string,
    error: any,
    attempts: number,
    isRetryable: boolean,
  ) {
    this.logger.error(
      `Firebase notification failed for token ${this.maskToken(token)} after ` +
        `${attempts} attempt(s)${isRetryable ? ' (retryable, gave up)' : ''}: ` +
        `${error?.code ?? ''} ${error?.message ?? error}`,
    );
  }

  private maskToken(token: string): string {
    return `${token?.substring(0, 10) ?? ''}...`;
  }

  private getPositiveNumberConfig(key: string, fallback: number): number {
    const value = Number(this.configService?.get<string>(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
