import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const RATE_LIMIT_KEY = 'rate_limit_options';

export interface RateLimitOptions {
  /** Max requests per window per caller. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Bucket name; defaults to the handler name. Must be unique per route. */
  keyPrefix?: string;
}

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

const MAX_TRACKED_BUCKETS = 50_000;

/**
 * In-memory fixed-window limiter. Single-instance only — fits the one-droplet
 * deployment; swap for a Redis-backed limiter before scaling horizontally.
 *
 * Callers are keyed by user id when the route is authenticated, falling back to
 * the client IP for public routes. Keying an authenticated route by IP would
 * put every subscriber behind one carrier-grade NAT into a single bucket.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(private readonly reflector: Reflector) {}

  /**
   * nginx sets X-Real-IP from $remote_addr, overwriting anything the client
   * sent, so it is the one hop-derived value a caller cannot forge. req.ip
   * derives from X-Forwarded-For, which nginx *appends* to — a client-supplied
   * value survives there and would let a caller rotate buckets at will.
   */
  private resolveCallerId(request: any): string {
    const userId = request.user?.id;
    if (userId != null) {
      return `u${userId}`;
    }

    const realIp = request.headers?.['x-real-ip'];
    if (typeof realIp === 'string' && realIp.length > 0) {
      return realIp;
    }
    return request.ip ?? 'unknown';
  }

  /**
   * Drops expired buckets, then — if the map is still over budget because the
   * flood is live rather than stale — the buckets closest to expiring. Sweeping
   * only expired entries would free nothing during exactly the burst that grows
   * the map, leaving an O(n) scan to run on every subsequent request.
   */
  private evict(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    if (this.buckets.size <= MAX_TRACKED_BUCKETS) return;

    const byExpiry = [...this.buckets.entries()].sort(
      (a, b) => a[1].resetAt - b[1].resetAt,
    );
    const excess = this.buckets.size - MAX_TRACKED_BUCKETS;
    for (let i = 0; i < excess; i++) {
      this.buckets.delete(byExpiry[i][0]);
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const request = context.switchToHttp().getRequest();
    const key = `${options.keyPrefix ?? context.getHandler().name}:${this.resolveCallerId(request)}`;
    const now = Date.now();

    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      if (this.buckets.size >= MAX_TRACKED_BUCKETS) {
        this.evict(now);
      }
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;

    if (bucket.count > options.limit) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
