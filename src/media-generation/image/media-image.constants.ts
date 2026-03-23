export enum MediaImageOrientation {
  HORIZONTAL = 'horizontal',
  VERTICAL = 'vertical',
}

export interface MediaImageDimensions {
  width: number;
  height: number;
}

export interface MediaImageModelProfile {
  key: string;
  modelMatchers: string[];
  dimensions: Record<MediaImageOrientation, MediaImageDimensions>;
}

export const MEDIA_IMAGE_DEFAULT_DIMENSIONS: Record<
  MediaImageOrientation,
  MediaImageDimensions
> = {
  [MediaImageOrientation.VERTICAL]: { width: 768, height: 1344 },
  [MediaImageOrientation.HORIZONTAL]: { width: 1344, height: 768 },
};

export const MEDIA_IMAGE_MODEL_PROFILES: MediaImageModelProfile[] = [
  {
    key: 'ssd-1b',
    modelMatchers: ['segmind/ssd-1b', 'ssd-1b'],
    dimensions: MEDIA_IMAGE_DEFAULT_DIMENSIONS,
  },
  {
    key: 'flux-schnell',
    modelMatchers: ['black-forest-labs/flux.1-schnell', 'flux.1-schnell'],
    dimensions: MEDIA_IMAGE_DEFAULT_DIMENSIONS,
  },
];

export const MEDIA_IMAGE_DEFAULT_NEGATIVE_PROMPT =
  'Blurry photo, distortion, low-res, poor quality';
export const MEDIA_IMAGE_DEFAULT_ORIENTATION = MediaImageOrientation.VERTICAL;
export const MEDIA_IMAGE_MIN_QUANTITY = 1;
export const MEDIA_IMAGE_MAX_QUANTITY = 4;
export const MEDIA_IMAGE_MAX_PROMPT_LENGTH = 4000;
export const MEDIA_IMAGE_GENERATION_QUEUE = 'media_image_generation';
export const MEDIA_IMAGE_SUBMIT_JOB = 'media_image_submit';
export const MEDIA_IMAGE_POLL_JOB = 'media_image_poll';
export const MEDIA_IMAGE_POLL_DELAY_MS = 5000;
export const MEDIA_IMAGE_MAX_POLL_ATTEMPTS = 120;
export const MEDIA_IMAGE_MAX_INVISIBLE_STATUS_ATTEMPTS = 24;
export const MEDIA_IMAGE_MAX_STUCK_QUEUE_ATTEMPTS = 30;
