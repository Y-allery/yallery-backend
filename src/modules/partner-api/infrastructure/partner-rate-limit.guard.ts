import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT_PER_MINUTE = 60;

/**
 * Per-key fixed-window limiter, sized from the key's own `rateLimitPerMinute`.
 *
 * Separate from the shared RateLimitGuard because that one takes a fixed limit from a
 * decorator and buckets by user or IP; a partner's limit is a property of their key, and
 * several partners can share one egress IP.
 *
 * Single-instance, like the shared guard — the deployment is one process.
 */
@Injectable()
export class PartnerRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<
    number,
    { count: number; resetAt: number }
  >();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const key = request.partnerKey;
    // Runs behind PartnerKeyGuard; an unauthenticated request never reaches here.
    if (!key) return true;

    const limit = key.rateLimitPerMinute ?? DEFAULT_LIMIT_PER_MINUTE;
    const now = Date.now();
    let bucket = this.buckets.get(key.id);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + WINDOW_MS };
      this.buckets.set(key.id, bucket);
      for (const [id, tracked] of this.buckets) {
        if (tracked.resetAt <= now) this.buckets.delete(id);
      }
    }
    bucket.count += 1;

    if (bucket.count > limit) {
      throw new HttpException(
        {
          error: {
            type: 'rate_limit_error',
            message: `Rate limit of ${limit} requests per minute exceeded. Retry in ${Math.ceil((bucket.resetAt - now) / 1000)}s.`,
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
