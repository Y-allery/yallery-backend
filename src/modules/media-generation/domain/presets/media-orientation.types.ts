export const MEDIA_ORIENTATIONS = ['horizontal', 'vertical'] as const;

export type MediaOrientation = (typeof MEDIA_ORIENTATIONS)[number];
