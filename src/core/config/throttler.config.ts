import { ExecutionContext } from '@nestjs/common';
import { ThrottlerModuleOptions } from '@nestjs/throttler';
import * as jwt from 'jsonwebtoken';

const DEFAULT_THROTTLE_TTL_MS = 60_000;
const DEFAULT_THROTTLE_LIMIT = 120;

/**
 * Paths the global limiter must never touch:
 * - /media/*: a single feed screen pulls dozens of images and posters through
 *   the proxy, so a per-caller request budget would break scrolling long
 *   before it protects anything (most answers are CDN redirects).
 * - webhooks: Adapty, Telegram and the in-process Sentry hook each arrive from
 *   one address, so every caller of a given integration shares a bucket — and
 *   a dropped webhook costs a purchase or an alert, not a retryable page view.
 */
const EXEMPT_PATH_PREFIXES = ['/media/', '/payment/webhook', '/ops-bot/'];

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function shouldSkipThrottle(context: ExecutionContext): boolean {
  // A global guard also runs for websocket gateways and queue processors,
  // where there is no request to key on and no response to add headers to.
  if (context.getType() !== 'http') {
    return true;
  }

  const request = context.switchToHttp().getRequest();
  const path: string = (request?.originalUrl ?? request?.url ?? '').split(
    '?',
  )[0];
  return EXEMPT_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * The signature is verified (an HMAC, no DB round-trip) rather than merely
 * decoded: an unchecked `sub` would let a caller mint a fresh bucket per
 * request and walk straight past the limiter.
 */
function resolveAuthenticatedCaller(req: Record<string, any>): string | null {
  const header = req?.headers?.authorization;
  if (typeof header !== 'string' || !/^bearer /i.test(header)) {
    return null;
  }

  try {
    const payload = jwt.verify(
      header.slice(7).trim(),
      process.env.JWT_SECRET || 'dev',
    );
    const sub = typeof payload === 'object' ? payload.sub : undefined;
    return sub ? `u${sub}` : null;
  } catch {
    // Expired or forged: this request is about to be rejected by JwtAuthGuard
    // anyway, and it must count against the address, not against a user id we
    // could not confirm.
    return null;
  }
}

/**
 * Authenticated callers are keyed by user id, because mobile carriers put
 * thousands of subscribers behind one public address and an address-only
 * bucket would let a single heavy user lock out a whole carrier.
 *
 * Everyone else is keyed by X-Real-IP, which nginx overwrites with the peer
 * address and a caller therefore cannot forge; X-Forwarded-For (the source of
 * req.ip) is only appended to, so a client-supplied entry survives there and
 * would let a caller rotate buckets at will. Same reasoning as RateLimitGuard.
 */
export function resolveThrottleTracker(req: Record<string, any>): string {
  const caller = resolveAuthenticatedCaller(req);
  if (caller) {
    return caller;
  }

  const realIp = req?.headers?.['x-real-ip'];
  if (typeof realIp === 'string' && realIp.length > 0) {
    return realIp;
  }
  return req?.ip ?? 'unknown';
}

/**
 * One budget per caller for the whole API, replacing the library default of
 * one budget per caller *per route* — that default both weakens the ceiling
 * (limit x number of endpoints) and multiplies the in-memory storage, which
 * never evicts its keys.
 */
export function generateThrottleKey(
  _context: ExecutionContext,
  tracker: string,
  throttlerName: string,
): string {
  return `${throttlerName}:${tracker}`;
}

/**
 * Backstop against a single misbehaving client saturating the one Node
 * process — it runs before JwtAuthGuard, so a flood is cut off before it costs
 * a user lookup per request. Tighter budgets for individual expensive routes
 * stay with @RateLimit. Limits are env-tunable so a launch-day surprise can be
 * widened without a redeploy.
 */
export function buildThrottlerOptions(
  env: NodeJS.ProcessEnv = process.env,
): ThrottlerModuleOptions {
  return {
    throttlers: [
      {
        ttl: readPositiveInt(env.THROTTLE_TTL_MS, DEFAULT_THROTTLE_TTL_MS),
        limit: readPositiveInt(env.THROTTLE_LIMIT, DEFAULT_THROTTLE_LIMIT),
      },
    ],
    skipIf: shouldSkipThrottle,
    getTracker: resolveThrottleTracker,
    generateKey: generateThrottleKey,
  };
}
