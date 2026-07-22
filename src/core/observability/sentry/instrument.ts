import * as Sentry from '@sentry/nestjs';

/**
 * Fire-and-forget tee to the ops Telegram bot for every error Sentry actually
 * reports (SentryGlobalFilter already screens out expected/4xx HttpExceptions
 * before calling captureException, so anything reaching here is a real bug).
 * Uses a loopback HTTP call to our own server rather than DI (this file runs
 * before NestFactory.create, outside the Nest DI graph) — /ops-bot/internal-notify
 * only accepts calls from 127.0.0.1, and by the time a real request error
 * occurs the server is already listening.
 */
function notifyOpsBot(event: Sentry.ErrorEvent): void {
  const port = process.env.PORT || 8000;
  const exception = event.exception?.values?.[0];
  const summary = exception
    ? `${exception.type}: ${exception.value}`
    : (event.message ?? 'Unknown error');
  const text = event.transaction
    ? `${event.transaction}\n${summary}`
    : summary;
  // Low-cardinality on purpose: the exception TYPE alone, never the message
  // (which often embeds per-request data like ids/params that would mint a
  // fresh debounce key every time and defeat the ops-bot's cooldown).
  const fingerprint = exception?.type ?? 'Unknown';
  const secret = process.env.OPS_INTERNAL_NOTIFY_SECRET;
  if (!secret) return; // unconfigured — no point calling an endpoint that will 403

  fetch(`http://127.0.0.1:${port}/ops-bot/internal-notify`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ops-internal-secret': secret,
    },
    body: JSON.stringify({ text, fingerprint }),
  }).catch(() => {
    // Never let a notify failure affect Sentry's own reporting.
  });
}

Sentry.init({
  dsn: 'https://bcff48666109cc8a417ed62624db8011@o4508597932457984.ingest.us.sentry.io/4508598384459776',
  tracesSampleRate: 1.0,
  beforeSend(event) {
    try {
      notifyOpsBot(event);
    } catch {
      // Same rule: never let this hook affect Sentry's own reporting.
    }
    return event;
  },
});
Sentry.profiler.startProfiler();

Sentry.startSpan(
  {
    name: 'My First Transaction',
  },
  () => {},
);
Sentry.profiler.stopProfiler();
