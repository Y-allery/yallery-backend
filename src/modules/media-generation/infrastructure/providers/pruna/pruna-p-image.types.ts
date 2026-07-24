export const PRUNA_P_IMAGE_MODEL = 'p-image' as const;
export const PRUNA_P_IMAGE_PREDICTIONS_PATH = '/v1/predictions';
export const PRUNA_P_IMAGE_STATUS_PATH_PREFIX = '/v1/predictions/status/';

export type PrunaPImageWidth = 704 | 1280;
export type PrunaPImageHeight = 704 | 1280;

export interface PrunaPImageInput {
  prompt: string;
  aspect_ratio: 'custom';
  width: PrunaPImageWidth;
  height: PrunaPImageHeight;
  prompt_upsampling: false;
  seed: number;
  disable_safety_checker: false;
}

export interface PrunaPImageRequest {
  input: PrunaPImageInput;
}

export interface PrunaPImageGenerationInput {
  prompt: string;
  width: PrunaPImageWidth;
  height: PrunaPImageHeight;
  seed: number;
}

export type PrunaHttpStatusClass = '1xx' | '2xx' | '3xx' | '4xx' | '5xx';

export type PrunaClientStage =
  | 'submit'
  | 'status'
  | 'download'
  | 'canonicalize'
  | 'store'
  | 'artifact_read';
export type PrunaSubmissionCertainty = 'accepted' | 'not_accepted' | 'unknown';

export type PrunaReasonCode =
  | 'PRUNA_REQUEST_INVALID'
  | 'PRUNA_CLIENT_POLICY_DRIFT'
  | 'PRUNA_SUBMISSION_REJECTED'
  | 'PRUNA_SUBMISSION_UNCERTAIN'
  | 'PRUNA_AUTH_REJECTED'
  | 'PRUNA_CREDIT_EXHAUSTED'
  | 'PRUNA_RATE_LIMITED'
  | 'PRUNA_STATUS_INVALID'
  | 'PRUNA_STATUS_UNAVAILABLE'
  | 'PRUNA_PREDICTION_NOT_FOUND'
  | 'PRUNA_DELIVERY_URL_REJECTED'
  | 'PRUNA_DELIVERY_REFERENCE_INVALID'
  | 'PRUNA_DOWNLOAD_FAILED'
  | 'PRUNA_DOWNLOAD_REDIRECT_REJECTED'
  | 'PRUNA_OUTPUT_INVALID'
  | 'PRUNA_OUTPUT_TOO_LARGE'
  | 'PRUNA_OUTPUT_DIMENSION_MISMATCH'
  | 'PRUNA_OUTPUT_ROTATED'
  | 'PRUNA_OUTPUT_COLORSPACE_UNSUPPORTED'
  | 'PRUNA_OUTPUT_BLANK'
  | 'PRUNA_OUTPUT_MULTI_IMAGE'
  | 'PRUNA_CANONICALIZATION_FAILED'
  | 'PRUNA_ARTIFACT_STORE_FAILED'
  | 'PRUNA_ARTIFACT_INTEGRITY_FAILED';

export interface PrunaSafeErrorMetadata {
  stage: PrunaClientStage;
  reasonCode: PrunaReasonCode;
  httpStatusClass?: PrunaHttpStatusClass;
  retryable: boolean;
  certainty: PrunaSubmissionCertainty;
}

/**
 * Its message and JSON form deliberately contain only bounded, non-sensitive
 * metadata. Provider response bodies, request URLs and transport error causes
 * never become part of this error.
 */
export class PrunaPImageClientError extends Error {
  readonly metadata: Readonly<PrunaSafeErrorMetadata>;

  constructor(metadata: PrunaSafeErrorMetadata) {
    super(metadata.reasonCode);
    this.name = 'PrunaPImageClientError';
    this.metadata = Object.freeze({ ...metadata });
  }

  toJSON(): PrunaSafeErrorMetadata {
    return { ...this.metadata };
  }
}

export interface PrunaStillSubmissionAccepted {
  certainty: 'accepted';
  predictionId: string;
  requestHash: string;
}

export interface PrunaStillSubmissionRejected {
  certainty: 'not_accepted';
  reasonCode:
    | 'PRUNA_SUBMISSION_REJECTED'
    | 'PRUNA_AUTH_REJECTED'
    | 'PRUNA_CREDIT_EXHAUSTED'
    | 'PRUNA_RATE_LIMITED';
  httpStatusClass: '4xx';
  retryAfterMs?: number;
}

export interface PrunaStillSubmissionUnknown {
  certainty: 'unknown';
  reasonCode: 'PRUNA_SUBMISSION_UNCERTAIN';
  requestHash: string;
  httpStatusClass?: PrunaHttpStatusClass;
}

export type PrunaStillSubmission =
  | PrunaStillSubmissionAccepted
  | PrunaStillSubmissionRejected
  | PrunaStillSubmissionUnknown;

export interface PrunaPredictionPending {
  status: 'starting' | 'processing';
}

export interface PrunaPredictionTerminal {
  status: 'failed' | 'canceled';
}

export interface PrunaPredictionSucceeded {
  status: 'succeeded';
}

export type PrunaPredictionStatus =
  | PrunaPredictionPending
  | PrunaPredictionTerminal
  | PrunaPredictionSucceeded;

export interface PrunaDownloadedJpeg {
  bytes: Buffer;
  mime: 'image/jpeg';
  byteLength: number;
  sha256: string;
}

export interface PrunaPImageClientPolicyConfig {
  pipelineConfigVersion: string;
  allowedDownloadHosts: readonly string[];
  apiBaseUrl?: string;
  submitTimeoutMs?: number;
  statusRequestTimeoutMs?: number;
  downloadTimeoutMs?: number;
  maxJsonResponseBytes?: number;
  maxSourceJpegBytes?: number;
  statusGetRetries?: number;
  downloadGetRetries?: number;
  getRetryBaseDelayMs?: number;
}

export interface PrunaPImageClientConfig extends PrunaPImageClientPolicyConfig {
  apiKey: string;
}

export interface ResolvedPrunaPImageClientPolicy {
  policySchemaVersion: 'pruna-p-image-client-policy-v1';
  model: typeof PRUNA_P_IMAGE_MODEL;
  pipelineConfigVersion: string;
  apiBaseUrl: string;
  allowedDownloadHosts: readonly string[];
  submitTimeoutMs: number;
  statusRequestTimeoutMs: number;
  downloadTimeoutMs: number;
  maxJsonResponseBytes: number;
  maxSourceJpegBytes: number;
  statusGetRetries: number;
  downloadGetRetries: number;
  getRetryBaseDelayMs: number;
  maxRetryAfterMs: number;
}
