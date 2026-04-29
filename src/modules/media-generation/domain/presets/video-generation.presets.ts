import {
  MEDIA_ORIENTATIONS,
  MediaOrientation,
} from './media-orientation.types';

type VideoOutputPreset = {
  size: string;
  aspectRatio: string;
};

type VideoPresetMap = Partial<Record<MediaOrientation, VideoOutputPreset>>;

const DEFAULT_VIDEO_PRESETS: Record<MediaOrientation, VideoOutputPreset> = {
  vertical: { size: '720p', aspectRatio: '9:16' },
  horizontal: { size: '720p', aspectRatio: '16:9' },
};

const VIDEO_PRESET_OVERRIDES: Record<string, VideoPresetMap> = {};

function getVideoPresetMap(aiService: string): Record<
  MediaOrientation,
  VideoOutputPreset
> {
  return {
    ...DEFAULT_VIDEO_PRESETS,
    ...VIDEO_PRESET_OVERRIDES[aiService],
  };
}

export function getVideoAllowedOrientations(aiService: string): MediaOrientation[] {
  const presets = getVideoPresetMap(aiService);

  return MEDIA_ORIENTATIONS.filter((orientation) => Boolean(presets[orientation]));
}

export function getVideoDefaultOrientation(aiService: string): MediaOrientation {
  return getVideoAllowedOrientations(aiService)[0] ?? 'vertical';
}

export function resolveVideoOrientation(
  aiService: string,
  orientation?: MediaOrientation,
): MediaOrientation {
  const resolvedOrientation = orientation ?? getVideoDefaultOrientation(aiService);
  const allowedOrientations = getVideoAllowedOrientations(aiService);

  if (!allowedOrientations.includes(resolvedOrientation)) {
    throw new Error(
      `Orientation "${resolvedOrientation}" is not allowed for video service "${aiService}". Allowed: ${allowedOrientations.join(', ')}`,
    );
  }

  return resolvedOrientation;
}

export function getVideoOutputPreset(
  aiService: string,
  orientation: MediaOrientation,
): VideoOutputPreset {
  const presets = getVideoPresetMap(aiService);
  const preset = presets[orientation];

  if (!preset) {
    throw new Error(
      `No video output preset configured for aiService "${aiService}" and orientation "${orientation}"`,
    );
  }

  return preset;
}
