import { createHash } from 'crypto';
import { isIP } from 'net';
import {
  FetchPrunaHttpTransport,
  PrunaHttpResponse,
  PrunaHttpTransport,
  PrunaTransportFailure,
} from './pruna-p-image.transport';
import {
  PRUNA_P_IMAGE_MODEL,
  PRUNA_P_IMAGE_PREDICTIONS_PATH,
  PRUNA_P_IMAGE_STATUS_PATH_PREFIX,
  PrunaDownloadedJpeg,
  PrunaHttpStatusClass,
  PrunaPImageClientConfig,
  PrunaPImageClientError,
  PrunaPImageClientPolicyConfig,
  PrunaPImageGenerationInput,
  PrunaPImageInput,
  PrunaPImageRequest,
  PrunaPredictionStatus,
  PrunaReasonCode,
  ResolvedPrunaPImageClientPolicy,
  PrunaStillSubmission,
  PrunaSubmissionCertainty,
} from './pruna-p-image.types';

const DEFAULT_API_BASE_URL = 'https://api.pruna.ai';
const DEFAULT_SUBMIT_TIMEOUT_MS = 10_000;
const DEFAULT_STATUS_REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_JSON_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_MAX_SOURCE_JPEG_BYTES = 6 * 1024 * 1024;
const DEFAULT_GET_RETRIES = 3;
const DEFAULT_GET_RETRY_BASE_DELAY_MS = 250;
const MAX_REQUEST_TIMEOUT_MS = 120_000;
const MAX_JSON_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_CONFIGURED_JPEG_BYTES = 32 * 1024 * 1024;
const MAX_GET_RETRIES = 5;
const MAX_RETRY_AFTER_MS = 10_000;
const MAX_PROMPT_UTF8_BYTES = 32 * 1024;
const PREDICTION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

interface ResolvedPrunaPImageClientConfig
  extends Omit<ResolvedPrunaPImageClientPolicy, 'allowedDownloadHosts'> {
  apiKey: string;
  allowedDownloadHosts: ReadonlySet<string>;
}

interface ParsedSucceededStatus {
  status: 'succeeded';
  deliveryUrl: URL;
}

type ParsedStatus =
  | { status: 'starting' | 'processing' | 'failed' | 'canceled' }
  | ParsedSucceededStatus;

type Sleep = (milliseconds: number) => Promise<void>;

/**
 * Isolated low-level P-Image client. This class is deliberately not registered
 * in a Nest module yet, so landing it cannot alter production routing.
 */
export class PrunaPImageClient {
  private readonly config: ResolvedPrunaPImageClientConfig;

  constructor(
    config: PrunaPImageClientConfig,
    private readonly transport: PrunaHttpTransport = new FetchPrunaHttpTransport(),
    private readonly sleep: Sleep = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {
    this.config = resolveConfig(config);
  }

  buildRequest(input: PrunaPImageGenerationInput): PrunaPImageRequest {
    validateGenerationInput(input);
    return {
      input: {
        prompt: input.prompt,
        aspect_ratio: 'custom',
        width: input.width,
        height: input.height,
        prompt_upsampling: false,
        seed: input.seed,
        disable_safety_checker: false,
      },
    };
  }

  requestHash(request: PrunaPImageRequest): string {
    assertExactRequest(request);
    return sha256(
      `${PRUNA_P_IMAGE_MODEL}\n${canonicalJson(request)}\n${
        this.config.pipelineConfigVersion
      }`,
    );
  }

  async submit(
    generationInput: PrunaPImageGenerationInput,
  ): Promise<PrunaStillSubmission> {
    const request = this.buildRequest(generationInput);
    const requestHash = this.requestHash(request);
    const body = canonicalJson(request);
    let response: PrunaHttpResponse;

    try {
      // Deliberately one call: never retry a possibly accepted paid POST.
      response = await this.transport.request({
        method: 'POST',
        url: `${this.config.apiBaseUrl}${PRUNA_P_IMAGE_PREDICTIONS_PATH}`,
        headers: {
          apikey: this.config.apiKey,
          Model: PRUNA_P_IMAGE_MODEL,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body,
        timeoutMs: this.config.submitTimeoutMs,
        maxResponseBytes: this.config.maxJsonResponseBytes,
        redirect: 'manual',
      });
    } catch {
      return {
        certainty: 'unknown',
        reasonCode: 'PRUNA_SUBMISSION_UNCERTAIN',
        requestHash,
      };
    }

    const statusClass = httpStatusClass(response.status);
    if (response.status >= 400 && response.status <= 499) {
      return submissionRejection(response);
    }

    if (response.status !== 201) {
      return {
        certainty: 'unknown',
        reasonCode: 'PRUNA_SUBMISSION_UNCERTAIN',
        requestHash,
        ...(statusClass ? { httpStatusClass: statusClass } : {}),
      };
    }

    try {
      const parsed = parseStrictJsonObject(response.body);
      const predictionId = parseAcceptedSubmission(
        parsed,
        request.input,
        this.config.apiBaseUrl,
      );
      return {
        certainty: 'accepted',
        predictionId,
        requestHash,
      };
    } catch {
      return {
        certainty: 'unknown',
        reasonCode: 'PRUNA_SUBMISSION_UNCERTAIN',
        requestHash,
        httpStatusClass: '2xx',
      };
    }
  }

  async getStatus(predictionId: string): Promise<PrunaPredictionStatus> {
    const parsed = await this.fetchParsedStatus(predictionId);
    return { status: parsed.status };
  }

  /**
   * Atomically re-fetches the succeeded prediction and consumes its delivery
   * URL in the same call. No URL/capability is retained in process memory or
   * persisted, so restarts cannot leak or invalidate materialization state.
   */
  async downloadSucceededJpeg(
    predictionId: string,
  ): Promise<PrunaDownloadedJpeg> {
    const parsed = await this.fetchParsedStatus(predictionId);
    if (parsed.status !== 'succeeded') {
      throw safeError('download', 'PRUNA_STATUS_UNAVAILABLE', true, 'accepted');
    }
    return this.downloadJpegFromUrl(parsed.deliveryUrl);
  }

  private async fetchParsedStatus(predictionId: string): Promise<ParsedStatus> {
    assertPredictionId(predictionId, 'status');
    const response = await this.getWithRetries(
      'status',
      `${this.config.apiBaseUrl}${PRUNA_P_IMAGE_STATUS_PATH_PREFIX}${predictionId}`,
      {
        apikey: this.config.apiKey,
        Accept: 'application/json',
      },
      this.config.statusRequestTimeoutMs,
      this.config.maxJsonResponseBytes,
      this.config.statusGetRetries,
    );

    if (response.status !== 200) {
      throw statusHttpError(response.status);
    }

    let parsed: ParsedStatus;
    try {
      parsed = parseStatus(
        parseStrictJsonObject(response.body),
        this.config.allowedDownloadHosts,
      );
    } catch (error) {
      if (error instanceof PrunaPImageClientError) {
        throw error;
      }
      throw safeError('status', 'PRUNA_STATUS_INVALID', false, 'accepted', {
        httpStatusClass: '2xx',
      });
    }

    return parsed;
  }

  private async downloadJpegFromUrl(
    deliveryUrl: URL,
  ): Promise<PrunaDownloadedJpeg> {
    let response: PrunaHttpResponse;
    try {
      response = await this.getWithRetries(
        'download',
        deliveryUrl.href,
        downloadHeaders(deliveryUrl, this.config),
        this.config.downloadTimeoutMs,
        this.config.maxSourceJpegBytes,
        this.config.downloadGetRetries,
      );
    } catch (error) {
      throw error;
    }

    if (response.status >= 300 && response.status <= 399) {
      throw safeError(
        'download',
        'PRUNA_DOWNLOAD_REDIRECT_REJECTED',
        false,
        'accepted',
        { httpStatusClass: '3xx' },
      );
    }
    if (response.status !== 200) {
      const error = downloadHttpError(response.status);
      throw error;
    }

    try {
      validateJpegResponse(response, this.config.maxSourceJpegBytes);
    } catch (error) {
      if (
        error instanceof PrunaPImageClientError &&
        error.metadata.reasonCode === 'PRUNA_OUTPUT_TOO_LARGE'
      ) {
        throw error;
      }
      throw safeError('download', 'PRUNA_OUTPUT_INVALID', false, 'accepted', {
        httpStatusClass: '2xx',
      });
    }

    return {
      bytes: response.body,
      mime: 'image/jpeg',
      byteLength: response.body.byteLength,
      sha256: sha256(response.body),
    };
  }

  private async getWithRetries(
    stage: 'status' | 'download',
    url: string,
    headers: Readonly<Record<string, string>>,
    timeoutMs: number,
    maxResponseBytes: number,
    retries: number,
  ): Promise<PrunaHttpResponse> {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await this.transport.request({
          method: 'GET',
          url,
          headers,
          timeoutMs,
          maxResponseBytes,
          redirect: 'manual',
        });

        if (
          (response.status === 429 ||
            (response.status >= 500 && response.status <= 599)) &&
          attempt < retries
        ) {
          await this.sleep(retryDelayMs(response, attempt, this.config));
          continue;
        }
        return response;
      } catch (error) {
        const tooLarge =
          error instanceof PrunaTransportFailure &&
          error.kind === 'response_too_large';
        if (tooLarge) {
          throw safeError(
            stage,
            stage === 'download'
              ? 'PRUNA_OUTPUT_TOO_LARGE'
              : 'PRUNA_STATUS_INVALID',
            false,
            'accepted',
          );
        }
        if (attempt < retries) {
          await this.sleep(
            boundedExponentialDelay(attempt, this.config.getRetryBaseDelayMs),
          );
          continue;
        }
        throw safeError(
          stage,
          stage === 'status'
            ? 'PRUNA_STATUS_UNAVAILABLE'
            : 'PRUNA_DOWNLOAD_FAILED',
          true,
          'accepted',
        );
      }
    }

    throw safeError(
      stage,
      stage === 'status' ? 'PRUNA_STATUS_UNAVAILABLE' : 'PRUNA_DOWNLOAD_FAILED',
      true,
      'accepted',
    );
  }
}

function resolveConfig(
  config: PrunaPImageClientConfig,
): ResolvedPrunaPImageClientConfig {
  if (
    !config ||
    typeof config.apiKey !== 'string' ||
    config.apiKey.length < 8 ||
    config.apiKey.length > 4096 ||
    config.apiKey !== config.apiKey.trim() ||
    /[\u0000-\u001f\u007f]/.test(config.apiKey)
  ) {
    throw safeError('submit', 'PRUNA_REQUEST_INVALID', false, 'not_accepted');
  }

  const policy = resolvePrunaPImageClientPolicy(config);
  return {
    ...policy,
    apiKey: config.apiKey,
    allowedDownloadHosts: new Set(policy.allowedDownloadHosts),
  };
}

export function resolvePrunaPImageClientPolicy(
  config: PrunaPImageClientPolicyConfig,
): ResolvedPrunaPImageClientPolicy {
  if (
    !config ||
    typeof config.pipelineConfigVersion !== 'string' ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(config.pipelineConfigVersion) ||
    !Array.isArray(config.allowedDownloadHosts) ||
    config.allowedDownloadHosts.length > 32
  ) {
    throw safeError('submit', 'PRUNA_REQUEST_INVALID', false, 'not_accepted');
  }

  const allowedDownloadHosts = [
    ...new Set(config.allowedDownloadHosts.map(validateAllowedHost)),
  ].sort();
  return Object.freeze({
    policySchemaVersion: 'pruna-p-image-client-policy-v1',
    model: PRUNA_P_IMAGE_MODEL,
    pipelineConfigVersion: config.pipelineConfigVersion,
    apiBaseUrl: validateApiBaseUrl(config.apiBaseUrl || DEFAULT_API_BASE_URL),
    allowedDownloadHosts: Object.freeze(allowedDownloadHosts),
    submitTimeoutMs: boundedPositiveInteger(
      config.submitTimeoutMs,
      DEFAULT_SUBMIT_TIMEOUT_MS,
      MAX_REQUEST_TIMEOUT_MS,
    ),
    statusRequestTimeoutMs: boundedPositiveInteger(
      config.statusRequestTimeoutMs,
      DEFAULT_STATUS_REQUEST_TIMEOUT_MS,
      MAX_REQUEST_TIMEOUT_MS,
    ),
    downloadTimeoutMs: boundedPositiveInteger(
      config.downloadTimeoutMs,
      DEFAULT_DOWNLOAD_TIMEOUT_MS,
      MAX_REQUEST_TIMEOUT_MS,
    ),
    maxJsonResponseBytes: boundedPositiveInteger(
      config.maxJsonResponseBytes,
      DEFAULT_MAX_JSON_RESPONSE_BYTES,
      MAX_JSON_RESPONSE_BYTES,
    ),
    maxSourceJpegBytes: boundedPositiveInteger(
      config.maxSourceJpegBytes,
      DEFAULT_MAX_SOURCE_JPEG_BYTES,
      MAX_CONFIGURED_JPEG_BYTES,
    ),
    statusGetRetries: boundedNonNegativeInteger(
      config.statusGetRetries,
      DEFAULT_GET_RETRIES,
      MAX_GET_RETRIES,
    ),
    downloadGetRetries: boundedNonNegativeInteger(
      config.downloadGetRetries,
      DEFAULT_GET_RETRIES,
      MAX_GET_RETRIES,
    ),
    getRetryBaseDelayMs: boundedNonNegativeInteger(
      config.getRetryBaseDelayMs,
      DEFAULT_GET_RETRY_BASE_DELAY_MS,
      MAX_RETRY_AFTER_MS,
    ),
    maxRetryAfterMs: MAX_RETRY_AFTER_MS,
  });
}

export function prunaPImageClientPolicySha256(
  config: PrunaPImageClientPolicyConfig,
): string {
  return sha256(JSON.stringify(resolvePrunaPImageClientPolicy(config)));
}

function downloadHeaders(
  deliveryUrl: URL,
  config: ResolvedPrunaPImageClientConfig,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'image/jpeg',
  };
  // Root credentials are valid only for the audited Pruna API origin. Signed
  // delivery hosts may be allow-listed, but never receive the root API key.
  if (deliveryUrl.origin === new URL(config.apiBaseUrl).origin) {
    headers.apikey = config.apiKey;
  }
  return headers;
}

function validateApiBaseUrl(candidate: string): string {
  try {
    const url = new URL(candidate);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'api.pruna.ai' ||
      (url.port !== '' && url.port !== '443') ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      throw new Error();
    }
    return DEFAULT_API_BASE_URL;
  } catch {
    throw safeError('submit', 'PRUNA_REQUEST_INVALID', false, 'not_accepted');
  }
}

function validateAllowedHost(candidate: string): string {
  const normalized =
    typeof candidate === 'string' ? candidate.trim().toLowerCase() : '';
  if (
    !normalized ||
    normalized.includes('*') ||
    normalized.endsWith('.') ||
    normalized.length > 253 ||
    isIP(normalized) !== 0 ||
    !normalized.includes('.') ||
    !normalized
      .split('.')
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  ) {
    throw safeError('submit', 'PRUNA_REQUEST_INVALID', false, 'not_accepted');
  }
  return normalized;
}

function validateGenerationInput(input: PrunaPImageGenerationInput): void {
  const exactCanvas =
    (input?.width === 1280 && input?.height === 704) ||
    (input?.width === 704 && input?.height === 1280);
  if (
    !input ||
    typeof input.prompt !== 'string' ||
    input.prompt.length === 0 ||
    input.prompt !== input.prompt.trim() ||
    Buffer.byteLength(input.prompt, 'utf8') > MAX_PROMPT_UTF8_BYTES ||
    !exactCanvas ||
    !Number.isSafeInteger(input.seed) ||
    input.seed < 0 ||
    input.seed > 4_294_967_295
  ) {
    throw safeError('submit', 'PRUNA_REQUEST_INVALID', false, 'not_accepted');
  }
}

function assertExactRequest(request: PrunaPImageRequest): void {
  if (
    !isPlainObject(request) ||
    !hasExactKeys(request, ['input']) ||
    !isPlainObject(request.input) ||
    !hasExactKeys(request.input, [
      'prompt',
      'aspect_ratio',
      'width',
      'height',
      'prompt_upsampling',
      'seed',
      'disable_safety_checker',
    ]) ||
    request.input.aspect_ratio !== 'custom' ||
    request.input.prompt_upsampling !== false ||
    request.input.disable_safety_checker !== false
  ) {
    throw safeError('submit', 'PRUNA_REQUEST_INVALID', false, 'not_accepted');
  }
  validateGenerationInput(request.input);
}

function parseAcceptedSubmission(
  parsed: Record<string, unknown>,
  expectedInput: PrunaPImageInput,
  apiBaseUrl: string,
): string {
  if (
    !hasExactKeys(parsed, ['id', 'model', 'input', 'get_url']) ||
    typeof parsed.id !== 'string' ||
    !PREDICTION_ID_PATTERN.test(parsed.id) ||
    parsed.model !== PRUNA_P_IMAGE_MODEL ||
    !isPlainObject(parsed.input) ||
    canonicalJson(parsed.input) !== canonicalJson(expectedInput) ||
    typeof parsed.get_url !== 'string'
  ) {
    throw new Error();
  }
  const expectedStatusUrl = `${apiBaseUrl}${PRUNA_P_IMAGE_STATUS_PATH_PREFIX}${parsed.id}`;
  if (validateStatusUrl(parsed.get_url, parsed.id) !== expectedStatusUrl) {
    throw new Error();
  }
  return parsed.id;
}

function parseStatus(
  parsed: Record<string, unknown>,
  allowedDownloadHosts: ReadonlySet<string>,
): ParsedStatus {
  if (
    !hasOnlyKeys(parsed, ['status', 'generation_url', 'message', 'error']) ||
    typeof parsed.status !== 'string' ||
    (parsed.message !== undefined && typeof parsed.message !== 'string') ||
    (parsed.error !== undefined && typeof parsed.error !== 'string')
  ) {
    throw new Error();
  }

  if (
    parsed.status !== 'starting' &&
    parsed.status !== 'processing' &&
    parsed.status !== 'succeeded' &&
    parsed.status !== 'failed' &&
    parsed.status !== 'canceled'
  ) {
    throw new Error();
  }

  if (parsed.status === 'succeeded') {
    if (typeof parsed.generation_url !== 'string') {
      throw new Error();
    }
    return {
      status: 'succeeded',
      deliveryUrl: validateDeliveryUrl(
        parsed.generation_url,
        allowedDownloadHosts,
      ),
    };
  }

  if (parsed.generation_url !== undefined && parsed.generation_url !== null) {
    throw new Error();
  }
  return { status: parsed.status };
}

function validateStatusUrl(candidate: string, predictionId: string): string {
  const url = strictHttpsUrl(candidate);
  if (
    url.hostname !== 'api.pruna.ai' ||
    url.pathname !== `${PRUNA_P_IMAGE_STATUS_PATH_PREFIX}${predictionId}` ||
    url.search
  ) {
    throw new Error();
  }
  return url.href.replace(/\/$/, '');
}

function validateDeliveryUrl(
  candidate: string,
  allowedDownloadHosts: ReadonlySet<string>,
): URL {
  try {
    const url = strictHttpsUrl(candidate);
    if (!allowedDownloadHosts.has(url.hostname.toLowerCase())) {
      throw new Error();
    }
    return url;
  } catch {
    throw safeError(
      'status',
      'PRUNA_DELIVERY_URL_REJECTED',
      false,
      'accepted',
      { httpStatusClass: '2xx' },
    );
  }
}

function strictHttpsUrl(candidate: string): URL {
  if (typeof candidate !== 'string' || !candidate.startsWith('https://')) {
    throw new Error();
  }
  const url = new URL(candidate);
  if (
    url.protocol !== 'https:' ||
    (url.port !== '' && url.port !== '443') ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error();
  }
  return url;
}

function parseStrictJsonObject(body: Buffer): Record<string, unknown> {
  try {
    const value = JSON.parse(body.toString('utf8'));
    if (!isPlainObject(value)) {
      throw new Error();
    }
    return value;
  } catch {
    throw new Error();
  }
}

function validateJpegResponse(
  response: PrunaHttpResponse,
  maxBytes: number,
): void {
  if (response.body.byteLength > maxBytes) {
    throw safeError('download', 'PRUNA_OUTPUT_TOO_LARGE', false, 'accepted', {
      httpStatusClass: '2xx',
    });
  }
  const declaredLength = response.headers['content-length'];
  if (declaredLength !== undefined) {
    if (!/^\d+$/.test(declaredLength)) {
      throw new Error();
    }
    const parsedLength = Number(declaredLength);
    if (
      !Number.isSafeInteger(parsedLength) ||
      parsedLength > maxBytes ||
      parsedLength !== response.body.byteLength
    ) {
      if (parsedLength > maxBytes) {
        throw safeError(
          'download',
          'PRUNA_OUTPUT_TOO_LARGE',
          false,
          'accepted',
          { httpStatusClass: '2xx' },
        );
      }
      throw new Error();
    }
  }

  const contentType = (response.headers['content-type'] || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const bytes = response.body;
  if (
    contentType !== 'image/jpeg' ||
    bytes.byteLength < 5 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff ||
    bytes[bytes.byteLength - 2] !== 0xff ||
    bytes[bytes.byteLength - 1] !== 0xd9
  ) {
    throw new Error();
  }
}

function submissionRejection(
  response: PrunaHttpResponse,
): PrunaStillSubmission {
  let reasonCode:
    | 'PRUNA_SUBMISSION_REJECTED'
    | 'PRUNA_AUTH_REJECTED'
    | 'PRUNA_CREDIT_EXHAUSTED'
    | 'PRUNA_RATE_LIMITED' = 'PRUNA_SUBMISSION_REJECTED';
  if (response.status === 401 || response.status === 403) {
    reasonCode = 'PRUNA_AUTH_REJECTED';
  } else if (response.status === 402) {
    reasonCode = 'PRUNA_CREDIT_EXHAUSTED';
  } else if (response.status === 429) {
    reasonCode = 'PRUNA_RATE_LIMITED';
  }

  const retryAfterMs =
    response.status === 429
      ? parseRetryAfterMs(response.headers['retry-after'])
      : undefined;
  return {
    certainty: 'not_accepted',
    reasonCode,
    httpStatusClass: '4xx',
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
  };
}

function statusHttpError(status: number): PrunaPImageClientError {
  if (status === 401 || status === 403) {
    return safeError('status', 'PRUNA_AUTH_REJECTED', false, 'accepted', {
      httpStatusClass: '4xx',
    });
  }
  if (status === 404) {
    return safeError(
      'status',
      'PRUNA_PREDICTION_NOT_FOUND',
      false,
      'accepted',
      { httpStatusClass: '4xx' },
    );
  }
  return safeError(
    'status',
    'PRUNA_STATUS_UNAVAILABLE',
    status === 429 || status >= 500,
    'accepted',
    {
      ...(httpStatusClass(status)
        ? { httpStatusClass: httpStatusClass(status) }
        : {}),
    },
  );
}

function downloadHttpError(status: number): PrunaPImageClientError {
  if (status === 401 || status === 403) {
    return safeError('download', 'PRUNA_AUTH_REJECTED', false, 'accepted', {
      httpStatusClass: '4xx',
    });
  }
  return safeError(
    'download',
    'PRUNA_DOWNLOAD_FAILED',
    status === 429 || status >= 500,
    'accepted',
    {
      ...(httpStatusClass(status)
        ? { httpStatusClass: httpStatusClass(status) }
        : {}),
    },
  );
}

function safeError(
  stage: 'submit' | 'status' | 'download',
  reasonCode: PrunaReasonCode,
  retryable: boolean,
  certainty: PrunaSubmissionCertainty,
  extra: { httpStatusClass?: PrunaHttpStatusClass } = {},
): PrunaPImageClientError {
  return new PrunaPImageClientError({
    stage,
    reasonCode,
    retryable,
    certainty,
    ...extra,
  });
}

function retryDelayMs(
  response: PrunaHttpResponse,
  attempt: number,
  config: ResolvedPrunaPImageClientConfig,
): number {
  return (
    parseRetryAfterMs(response.headers['retry-after']) ??
    boundedExponentialDelay(attempt, config.getRetryBaseDelayMs)
  );
}

function parseRetryAfterMs(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    return Math.min(MAX_RETRY_AFTER_MS, Math.ceil(Number(value) * 1000));
  }
  const parsedDate = Date.parse(value);
  if (!Number.isFinite(parsedDate)) {
    return undefined;
  }
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, parsedDate - Date.now()));
}

function boundedExponentialDelay(attempt: number, baseMs: number): number {
  return Math.min(MAX_RETRY_AFTER_MS, baseMs * 2 ** attempt);
}

function assertPredictionId(predictionId: string, stage: 'status'): void {
  if (
    typeof predictionId !== 'string' ||
    !PREDICTION_ID_PATTERN.test(predictionId)
  ) {
    throw safeError(stage, 'PRUNA_STATUS_INVALID', false, 'accepted');
  }
}

function httpStatusClass(status: number): PrunaHttpStatusClass | undefined {
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    return undefined;
  }
  return `${Math.floor(status / 100)}xx` as PrunaHttpStatusClass;
}

function boundedPositiveInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw safeError('submit', 'PRUNA_REQUEST_INVALID', false, 'not_accepted');
  }
  return value;
}

function boundedNonNegativeInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw safeError('submit', 'PRUNA_REQUEST_INVALID', false, 'not_accepted');
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const exact = [...expected].sort();
  return (
    keys.length === exact.length &&
    keys.every((key, index) => key === exact[index])
  );
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
