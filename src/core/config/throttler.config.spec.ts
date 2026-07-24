import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as jwt from 'jsonwebtoken';
import {
  buildThrottlerOptions,
  generateThrottleKey,
  resolveThrottleTracker,
  shouldSkipThrottle,
} from './throttler.config';

const httpContext = (url: string) =>
  ({
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ originalUrl: url }) }),
  }) as any;

describe('shouldSkipThrottle', () => {
  it('throttles ordinary API routes', () => {
    expect(shouldSkipThrottle(httpContext('/post/feed?page=2'))).toBe(false);
    expect(shouldSkipThrottle(httpContext('/user/me'))).toBe(false);
  });

  it('skips the media proxy, whose fan-out is one screen of images', () => {
    expect(shouldSkipThrottle(httpContext('/media/image/upload/x.jpg'))).toBe(
      true,
    );
    expect(shouldSkipThrottle(httpContext('/media/video/upload/x.mp4'))).toBe(
      true,
    );
  });

  it('skips webhooks, where every caller shares one source address', () => {
    expect(shouldSkipThrottle(httpContext('/payment/webhook'))).toBe(true);
    expect(shouldSkipThrottle(httpContext('/ops-bot/internal-notify'))).toBe(
      true,
    );
  });

  it('skips non-http contexts, which carry no request to key on', () => {
    const wsContext = { getType: () => 'ws' } as any;
    expect(shouldSkipThrottle(wsContext)).toBe(true);
  });
});

describe('resolveThrottleTracker', () => {
  const secret = 'throttler-spec-secret';
  const originalSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = secret;
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  it('keys authenticated callers by user id, not by shared carrier address', () => {
    const token = jwt.sign({ sub: 125 }, secret);
    expect(
      resolveThrottleTracker({
        headers: { authorization: `Bearer ${token}`, 'x-real-ip': '1.1.1.1' },
      }),
    ).toBe('u125');
  });

  it('falls back to the address for a forged or expired token', () => {
    const forged = jwt.sign({ sub: 999 }, 'not-the-real-secret');
    const expired = jwt.sign({ sub: 125 }, secret, { expiresIn: -10 });

    expect(
      resolveThrottleTracker({
        headers: { authorization: `Bearer ${forged}`, 'x-real-ip': '1.1.1.1' },
      }),
    ).toBe('1.1.1.1');
    expect(
      resolveThrottleTracker({
        headers: { authorization: `Bearer ${expired}`, 'x-real-ip': '1.1.1.1' },
      }),
    ).toBe('1.1.1.1');
  });

  it('prefers X-Real-IP, the value nginx overwrites', () => {
    expect(
      resolveThrottleTracker({
        headers: { 'x-real-ip': '1.1.1.1' },
        ip: '2.2.2.2',
      }),
    ).toBe('1.1.1.1');
  });

  it('falls back to req.ip and never to a shared empty key', () => {
    expect(resolveThrottleTracker({ headers: {}, ip: '2.2.2.2' })).toBe(
      '2.2.2.2',
    );
    expect(resolveThrottleTracker({})).toBe('unknown');
  });
});

describe('generateThrottleKey', () => {
  it('gives a caller one budget for the whole API, not one per route', () => {
    const feed = generateThrottleKey(
      httpContext('/post/feed'),
      'u1',
      'default',
    );
    const likes = generateThrottleKey(httpContext('/like'), 'u1', 'default');

    expect(feed).toBe(likes);
    expect(feed).not.toBe(
      generateThrottleKey(httpContext('/post/feed'), 'u2', 'default'),
    );
  });
});

describe('buildThrottlerOptions', () => {
  const throttlerOf = (env: NodeJS.ProcessEnv) =>
    (buildThrottlerOptions(env) as { throttlers: any[] }).throttlers[0];

  it('defaults to 120 requests per minute', () => {
    expect(throttlerOf({})).toMatchObject({ ttl: 60_000, limit: 120 });
  });

  it('is env-tunable without a redeploy', () => {
    expect(
      throttlerOf({ THROTTLE_LIMIT: '300', THROTTLE_TTL_MS: '10000' }),
    ).toMatchObject({ ttl: 10_000, limit: 300 });
  });

  it('ignores unusable values instead of disabling the limiter', () => {
    expect(
      throttlerOf({ THROTTLE_LIMIT: '0', THROTTLE_TTL_MS: 'abc' }),
    ).toMatchObject({ ttl: 60_000, limit: 120 });
  });
});

/**
 * ThrottlerGuard reads skipIf/getTracker/generateKey only from the module-level
 * object, never from an entry in `throttlers` — a shape mistake there would
 * silently disable all three.
 */
describe('ThrottlerGuard wired with the app options', () => {
  let moduleRef: TestingModule;

  afterEach(async () => {
    await moduleRef?.close();
  });

  const guardContext = (request: Record<string, any>, handlerName: string) => {
    const handler = { name: handlerName };
    return {
      getType: () => 'http',
      getHandler: () => handler,
      getClass: () => ({ name: 'TestController' }),
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ header: jest.fn() }),
      }),
    } as any;
  };

  const createGuard = async (env: NodeJS.ProcessEnv) => {
    moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot(buildThrottlerOptions(env))],
      providers: [ThrottlerGuard],
    }).compile();
    await moduleRef.init();
    return moduleRef.get(ThrottlerGuard);
  };

  it('lets `limit` requests through and rejects the next one', async () => {
    const guard = await createGuard({ THROTTLE_LIMIT: '2' });
    const context = guardContext(
      { headers: { 'x-real-ip': '1.1.1.1' }, originalUrl: '/post' },
      'feed',
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).rejects.toThrow();
  });

  it('spends one budget across routes, so the ceiling is not per endpoint', async () => {
    const guard = await createGuard({ THROTTLE_LIMIT: '1' });
    const headers = { 'x-real-ip': '1.1.1.1' };

    await expect(
      guard.canActivate(
        guardContext({ headers, originalUrl: '/post' }, 'feed'),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        guardContext({ headers, originalUrl: '/like' }, 'like'),
      ),
    ).rejects.toThrow();
  });

  it('buckets per caller, so one client cannot exhaust another', async () => {
    const guard = await createGuard({ THROTTLE_LIMIT: '1' });
    const url = { originalUrl: '/post' };

    await expect(
      guard.canActivate(
        guardContext({ headers: { 'x-real-ip': '1.1.1.1' }, ...url }, 'feed'),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        guardContext({ headers: { 'x-real-ip': '2.2.2.2' }, ...url }, 'feed'),
      ),
    ).resolves.toBe(true);
  });

  it('never throttles the exempt paths', async () => {
    const guard = await createGuard({ THROTTLE_LIMIT: '1' });
    const context = guardContext(
      { headers: {}, originalUrl: '/media/image/upload/a.jpg' },
      'serveImage',
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
