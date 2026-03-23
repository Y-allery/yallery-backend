export const RUNPOD_API_BASE_URL = 'https://api.runpod.ai/v2';
export const RUNPOD_DEFAULT_REQUEST_TIMEOUT_MS = 30000;
export const RUNPOD_DEFAULT_POLL_INTERVAL_MS = 5000;
export const RUNPOD_DEFAULT_EXECUTION_TIMEOUT_MS = 600000;
// RunPod TTL covers the entire job lifecycle: queue time + execution time.
// Keep the default aligned with RunPod's 24h default so queued jobs do not
// disappear from `/status` before workers pick them up.
export const RUNPOD_DEFAULT_TTL_MS = 86400000;

export enum RunpodEndpointType {
  IMAGE = 'image',
  IMAGE_EDIT = 'image_edit',
  VIDEO = 'video',
  AUDIO = 'audio',
}
