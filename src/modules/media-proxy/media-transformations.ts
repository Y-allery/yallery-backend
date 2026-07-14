/**
 * Registry of the named media transformations the mobile app inserts into
 * media URLs (t_<name>/ after /image/upload/ or /video/upload/), mirroring
 * the named transformations previously defined in Cloudinary.
 *
 * Definitions were exported from the Cloudinary account on 2026-07-14 and
 * must stay in sync with yallery_app/lib/utils/media_url_transformer.dart
 * and cloudinary_download_url_builder.dart.
 */

export type MediaResourceType = 'image' | 'video';

export interface ImageTransformation {
  kind: 'image';
  /** c_fill w×h (cover) or c_limit (inside, no enlargement). */
  fit: 'cover' | 'inside';
  width: number;
  height?: number;
  /** Cloudinary q_auto:eco / q_auto:good quality tiers. */
  quality: 'eco' | 'good';
  /** Overlay public/watermark.png (18% of width, SE corner, 80% opacity). */
  watermark?: boolean;
  /** fl_attachment — serve with Content-Disposition: attachment. */
  attachment?: boolean;
}

export interface VideoTransformation {
  kind: 'video';
  /** c_limit width for an h264 transcode; omitted = keep original bytes. */
  maxWidth?: number;
  /** fl_attachment — serve with Content-Disposition: attachment. */
  attachment?: boolean;
}

export type MediaTransformation = ImageTransformation | VideoTransformation;

export const MEDIA_TRANSFORMATIONS: Record<string, MediaTransformation> = {
  /** Post/feed images: q_auto:good, w_1080, c_limit. */
  t_yallery_feed_image_v2: {
    kind: 'image',
    fit: 'inside',
    width: 1080,
    quality: 'good',
  },
  /** Avatars/thumbnails: g_auto, w_400, h_400, c_fill, q_auto:eco. */
  t_yallery_thumb_image_v2: {
    kind: 'image',
    fit: 'cover',
    width: 400,
    height: 400,
    quality: 'eco',
  },
  /** Large still previews: q_auto:good, w_720, c_limit. */
  t_yallery_preview_image_v2: {
    kind: 'image',
    fit: 'inside',
    width: 720,
    quality: 'good',
  },
  /** Post videos: q_auto:good, w_720, c_limit. */
  t_yallery_video_720_v2: {
    kind: 'video',
    maxWidth: 720,
  },
  /** Meme/reference video previews: q_auto:good, so_0, w_720, c_limit. */
  t_yallery_video_preview_v2: {
    kind: 'video',
    maxWidth: 720,
  },
  /** Watermarked image download: c_limit w_1600 + yallery:watermark overlay + fl_attachment. */
  t_yallery_download_watermarked_v1: {
    kind: 'image',
    fit: 'inside',
    width: 1600,
    quality: 'good',
    watermark: true,
    attachment: true,
  },
  /** Video download: original bytes + fl_attachment. */
  t_yallery_video_download_v1: {
    kind: 'video',
    attachment: true,
  },
};

export interface ParsedMediaPath {
  /** Named transformation to apply, if any. */
  transformationName: string | null;
  transformation: MediaTransformation | null;
  /**
   * Legacy Cloudinary eager-poster marker (so_<offset>/ segment). Such URLs
   * reference a poster jpg derived from a video that was never migrated as
   * an object; the proxy regenerates it from the source video.
   */
  posterOfVideo: boolean;
  /** Object key inside the Spaces bucket. */
  key: string;
}

const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\/-]*$/;
const VERSION_SEGMENT = /^v\d+$/;
const START_OFFSET_SEGMENT = /^so_[\dp.]+$/;

/**
 * Parses the wildcard path following /media/{image|video}/upload/.
 *
 * Accepted shapes (in order): an optional t_<name>/ named transformation,
 * an optional legacy so_<offset>/ poster marker, an optional v<digits>/
 * version segment, then the object key. Comma-separated raw transform
 * segments (w_300,c_fill/...) are tolerated and skipped, matching how the
 * Cloudinary -> Spaces migration mapped every variant to the original.
 *
 * Returns null for paths that cannot be resolved to a safe object key.
 */
export function parseMediaPath(rawPath: string): ParsedMediaPath | null {
  const segments = (rawPath ?? '')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  let transformationName: string | null = null;
  let posterOfVideo = false;

  let index = 0;
  while (index < segments.length - 1) {
    const segment = segments[index];
    if (segment.startsWith('t_')) {
      // Only whitelisted named transformations are recognized; an unknown
      // t_* segment is treated as part of no known variant -> reject.
      if (!MEDIA_TRANSFORMATIONS[segment]) return null;
      if (transformationName) return null;
      transformationName = segment;
      index++;
    } else if (START_OFFSET_SEGMENT.test(segment)) {
      posterOfVideo = true;
      index++;
    } else if (VERSION_SEGMENT.test(segment)) {
      index++;
    } else if (segment.includes(',')) {
      // Raw comma-separated transform chain — maps to the original.
      index++;
    } else {
      break;
    }
  }

  const key = segments.slice(index).join('/');
  if (!key || key.includes('..') || !KEY_PATTERN.test(key)) return null;

  return {
    transformationName,
    transformation: transformationName
      ? MEDIA_TRANSFORMATIONS[transformationName]
      : null,
    posterOfVideo,
    key,
  };
}

/** Spaces key of the cached derived object for (transformation, key). */
export function derivedObjectKey(variant: string, key: string): string {
  return `t/${variant}/${key}`;
}

/** Poster (first-frame jpg) derived key for a legacy so_0 video poster. */
export function posterObjectKey(key: string): string {
  return `t/poster/${key}`;
}
