import { HttpException } from '@nestjs/common';
import { RateLimitGuard, RateLimitOptions } from './rate-limit.guard';

describe('RateLimitGuard', () => {
  const createContext = (
    headers: Record<string, string> = {},
    ip = '10.0.0.1',
    user?: { id: number },
  ) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ headers, ip, user }) }),
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
    }) as any;

  const createGuard = (options: RateLimitOptions | undefined) => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(options) };
    return new RateLimitGuard(reflector as any);
  };

  it('passes routes without @RateLimit metadata', () => {
    const guard = createGuard(undefined);
    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('allows exactly `limit` requests and rejects the next', () => {
    const guard = createGuard({ limit: 3, windowMs: 60_000, keyPrefix: 't' });
    const context = createContext();

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
    expect(() => guard.canActivate(context)).toThrow(HttpException);
  });

  it('buckets per client, so one caller cannot exhaust another', () => {
    const guard = createGuard({ limit: 1, windowMs: 60_000, keyPrefix: 't' });

    expect(guard.canActivate(createContext({ 'x-real-ip': '1.1.1.1' }))).toBe(
      true,
    );
    expect(() =>
      guard.canActivate(createContext({ 'x-real-ip': '1.1.1.1' })),
    ).toThrow(HttpException);
    expect(guard.canActivate(createContext({ 'x-real-ip': '2.2.2.2' }))).toBe(
      true,
    );
  });

  it('keys on X-Real-IP so a forged X-Forwarded-For cannot rotate buckets', () => {
    const guard = createGuard({ limit: 1, windowMs: 60_000, keyPrefix: 't' });
    // Same real client (nginx-set X-Real-IP), different spoofed req.ip values.
    const first = createContext({ 'x-real-ip': '5.5.5.5' }, '9.9.9.9');
    const second = createContext({ 'x-real-ip': '5.5.5.5' }, '8.8.8.8');

    expect(guard.canActivate(first)).toBe(true);
    expect(() => guard.canActivate(second)).toThrow(HttpException);
  });

  it('keys authenticated callers by user id, so one NAT cannot lock out a carrier', () => {
    const guard = createGuard({ limit: 1, windowMs: 60_000, keyPrefix: 't' });
    const sharedIp = { 'x-real-ip': '3.3.3.3' };

    expect(guard.canActivate(createContext(sharedIp, '3.3.3.3', { id: 1 }))).toBe(
      true,
    );
    // Different subscriber, same carrier IP: must not inherit user 1's bucket.
    expect(guard.canActivate(createContext(sharedIp, '3.3.3.3', { id: 2 }))).toBe(
      true,
    );
    // Same user again: now the limit bites.
    expect(() =>
      guard.canActivate(createContext(sharedIp, '3.3.3.3', { id: 1 })),
    ).toThrow(HttpException);
  });

  it('falls back to req.ip when X-Real-IP is absent (local dev, no nginx)', () => {
    const guard = createGuard({ limit: 1, windowMs: 60_000, keyPrefix: 't' });

    expect(guard.canActivate(createContext({}, '7.7.7.7'))).toBe(true);
    expect(() => guard.canActivate(createContext({}, '7.7.7.7'))).toThrow(
      HttpException,
    );
    expect(guard.canActivate(createContext({}, '6.6.6.6'))).toBe(true);
  });

  it('starts a fresh window once the previous one expires', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T12:00:00Z'));
    try {
      const guard = createGuard({ limit: 1, windowMs: 1_000, keyPrefix: 't' });
      const context = createContext();

      expect(guard.canActivate(context)).toBe(true);
      expect(() => guard.canActivate(context)).toThrow(HttpException);

      jest.advanceTimersByTime(1_001);
      expect(guard.canActivate(context)).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
