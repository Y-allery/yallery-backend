export const RUNPOD_API_BASE_URL = 'https://api.runpod.ai/v2';
export const RUNPOD_DEFAULT_REQUEST_TIMEOUT_MS = 30000;
export const RUNPOD_DEFAULT_POLL_INTERVAL_MS = 5000;
export const RUNPOD_DEFAULT_EXECUTION_TIMEOUT_MS = 600000;
export const RUNPOD_DEFAULT_TTL_MS = 60000;

export enum RunpodEndpointType {
  IMAGE = 'image',
  IMAGE_EDIT = 'image_edit',
  VIDEO = 'video',
  AUDIO = 'audio',
}
