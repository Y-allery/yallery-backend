export interface RunpodExecutionPolicy {
  executionTimeout?: number;
  lowPriority?: boolean;
  ttl?: number;
}

export interface RunpodS3Config {
  accessId: string;
  accessSecret: string;
  bucketName: string;
  endpointUrl: string;
}

export interface RunpodJobRequest<
  TInput extends Record<string, unknown> = Record<string, unknown>,
> {
  input: TInput;
  webhook?: string;
  policy?: RunpodExecutionPolicy;
  s3Config?: RunpodS3Config;
}

export interface RunpodQueuedResponse {
  id: string;
  status: string;
  [key: string]: unknown;
}

export interface RunpodStatusResponse<TOutput = unknown> {
  id: string;
  status: string;
  delayTime?: number;
  executionTime?: number;
  output?: TOutput;
  error?: unknown;
  [key: string]: unknown;
}

export interface RunpodCancelResponse {
  id?: string;
  status: string;
  [key: string]: unknown;
}

export interface RunpodHealthJobCounts {
  completed?: number;
  failed?: number;
  inProgress?: number;
  inQueue?: number;
  retried?: number;
  [key: string]: unknown;
}

export interface RunpodHealthWorkerCounts {
  idle?: number;
  initializing?: number;
  ready?: number;
  running?: number;
  throttled?: number;
  unhealthy?: number;
  [key: string]: unknown;
}

export interface RunpodHealthResponse {
  jobs?: RunpodHealthJobCounts;
  workers?: RunpodHealthWorkerCounts;
  [key: string]: unknown;
}

export interface RunpodRunSyncOptions {
  waitMs?: number;
}

export interface RunpodStatusOptions {
  ttlMs?: number;
}

export interface RunpodWaitForCompletionOptions extends RunpodStatusOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export interface RunpodTextToImageInput extends Record<string, unknown> {
  prompt: string;
  negative_prompt?: string;
  model?: string;
  width: number;
  height: number;
  num_images: number;
  output_format?: string;
}

export interface RunpodGeneratedImageAsset {
  kind: 'url' | 'base64';
  url?: string;
  base64?: string;
  mimeType?: string;
}

export interface RunpodImageGenerationResult {
  jobId: string;
  providerModel: string;
  assets: RunpodGeneratedImageAsset[];
}

export interface RunpodImageGenerationStatus {
  state: 'pending' | 'completed' | 'failed';
  jobId: string;
  providerModel: string;
  rawStatus: string;
  assets?: RunpodGeneratedImageAsset[];
  error?: string;
}
