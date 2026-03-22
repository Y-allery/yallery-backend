export enum MediaImageOrientation {
  HORIZONTAL = 'horizontal',
  VERTICAL = 'vertical',
}

export const MEDIA_IMAGE_DIMENSIONS = {
  [MediaImageOrientation.VERTICAL]: { width: 768, height: 1344 },
  [MediaImageOrientation.HORIZONTAL]: { width: 1344, height: 768 },
};

export const MEDIA_IMAGE_DEFAULT_NEGATIVE_PROMPT =
  'Blurry photo, distortion, low-res, poor quality';
export const MEDIA_IMAGE_DEFAULT_ORIENTATION = MediaImageOrientation.VERTICAL;
export const MEDIA_IMAGE_MIN_QUANTITY = 1;
export const MEDIA_IMAGE_MAX_QUANTITY = 4;
export const MEDIA_IMAGE_MAX_PROMPT_LENGTH = 4000;
