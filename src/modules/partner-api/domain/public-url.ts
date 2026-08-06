/**
 * Every URL a partner hands us is one we will fetch or POST to, which makes an unvalidated
 * one a request forgery primitive pointed at our own network.
 *
 * The check is on the literal form only — a hostname that resolves into a private range
 * still passes. Closing that needs resolution plus a re-check at connect time; until then
 * callers must also refuse redirects, which is where the cheap bypass would otherwise live.
 */
const PRIVATE_HOST = new RegExp(
  [
    '^localhost$',
    '^127\\.',
    '^0\\.',
    '^10\\.',
    '^192\\.168\\.',
    '^169\\.254\\.',
    '^172\\.(1[6-9]|2\\d|3[01])\\.',
    '^\\[?::1\\]?$',
    '^\\[?f[cd]',
    '\\.internal$',
    '\\.local$',
  ].join('|'),
  'i',
);

export const MAX_URL_LENGTH = 2048;

export function isPublicHttpUrl(candidate: unknown): boolean {
  if (typeof candidate !== 'string' || candidate.length > MAX_URL_LENGTH) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  return !PRIVATE_HOST.test(parsed.hostname);
}
