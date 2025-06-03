import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: 'https://bcff48666109cc8a417ed62624db8011@o4508597932457984.ingest.us.sentry.io/4508598384459776',
  tracesSampleRate: 1.0,
  
});
Sentry.profiler.startProfiler();

Sentry.startSpan(
  {
    name: 'My First Transaction',
  },
  () => {},
);
Sentry.profiler.stopProfiler();
