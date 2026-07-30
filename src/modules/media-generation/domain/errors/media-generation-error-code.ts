export const MEDIA_GENERATION_ERROR_CODES = [
  'provider_timeout',
  'provider_error',
  'nsfw_blocked',
  'invalid_input',
  'internal_error',
  'unknown',
] as const;

export type MediaGenerationErrorCode =
  (typeof MEDIA_GENERATION_ERROR_CODES)[number];

/** Substring of KreaContentSafetyService's BLOCKED_MESSAGE — the only 400 that is not the user's input. */
const NSFW_MARKER = 'violates the content safety policy';

const TIMEOUT_MARKERS = [
  'did not finish within',
  'timeout of',
  'etimedout',
  'econnaborted',
];

const PROVIDER_MARKERS = [
  'failed with status',
  'completed without output',
  'econnrefused',
  'econnreset',
  'enotfound',
  'socket hang up',
];

const INTERNAL_MARKERS = ['is not configured'];

/** Our own invariant throws are bare SCREAMING_SNAKE slugs, e.g. RUNPOD_OUTPUT_INVALID. */
const INVARIANT_SLUG = /^[A-Z][A-Z0-9_]{3,}$/;

interface StatusCarrier {
  getStatus?: unknown;
  isAxiosError?: unknown;
  code?: unknown;
  response?: { status?: unknown };
}

function readStatus(error: StatusCarrier): number | null {
  if (typeof error.getStatus === 'function') {
    const status = (error as { getStatus: () => unknown }).getStatus();
    if (typeof status === 'number') {
      return status;
    }
  }
  const responseStatus = error.response?.status;
  return typeof responseStatus === 'number' ? responseStatus : null;
}

/**
 * Maps a failed generation onto a stable analytics slug. Keyed on exception type and HTTP
 * status rather than message text, because the messages carry timings and ids that make
 * free-text grouping useless — which is the whole reason this code exists.
 */
export function classifyMediaGenerationError(
  error: unknown,
): MediaGenerationErrorCode {
  if (!(error instanceof Error)) {
    return 'unknown';
  }

  const message = (error.message || '').toLowerCase();
  if (!message) {
    return 'unknown';
  }

  if (message.includes(NSFW_MARKER)) {
    return 'nsfw_blocked';
  }

  const carrier = error as unknown as StatusCarrier;
  const status = readStatus(carrier);
  const isAxios = carrier.isAxiosError === true;
  // Network failures carry the signal in error.code (ECONNABORTED), not in the message.
  const haystack =
    typeof carrier.code === 'string'
      ? `${message} ${carrier.code.toLowerCase()}`
      : message;

  if (status === 504) {
    return 'provider_timeout';
  }
  if (status === 502 || status === 503) {
    return 'provider_error';
  }
  // A 4xx from the provider is our call being rejected upstream, not bad user input.
  if (!isAxios && (status === 400 || status === 422)) {
    return 'invalid_input';
  }

  if (TIMEOUT_MARKERS.some((marker) => haystack.includes(marker))) {
    return 'provider_timeout';
  }
  if (isAxios || PROVIDER_MARKERS.some((marker) => haystack.includes(marker))) {
    return 'provider_error';
  }
  if (
    status !== null ||
    INTERNAL_MARKERS.some((marker) => message.includes(marker)) ||
    INVARIANT_SLUG.test(error.message.trim()) ||
    // TypeError, RangeError and friends are our bugs, never an upstream condition.
    error.constructor !== Error
  ) {
    return 'internal_error';
  }

  return 'unknown';
}
