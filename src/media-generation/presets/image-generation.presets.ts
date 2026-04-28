import {
  MEDIA_ORIENTATIONS,
  MediaOrientation,
} from './media-orientation.types';

export type PromptImageDimensions = {
  width: number;
  height: number;
};

type PromptImagePresetMap = Partial<
  Record<MediaOrientation, PromptImageDimensions>
>;

const DEFAULT_PROMPT_IMAGE_PRESETS: Record<
  MediaOrientation,
  PromptImageDimensions
> = {
  vertical: { width: 768, height: 1344 },
  horizontal: { width: 1344, height: 768 },
};

const PROMPT_IMAGE_PRESET_OVERRIDES: Record<string, PromptImagePresetMap> = {};

function getPromptImagePresetMap(aiService: string): Record<
  MediaOrientation,
  PromptImageDimensions
> {
  return {
    ...DEFAULT_PROMPT_IMAGE_PRESETS,
    ...PROMPT_IMAGE_PRESET_OVERRIDES[aiService],
  };
}

export function getPromptImageAllowedOrientations(
  aiService: string,
): MediaOrientation[] {
  const presets = getPromptImagePresetMap(aiService);

  return MEDIA_ORIENTATIONS.filter((orientation) => Boolean(presets[orientation]));
}

export function getPromptImageOutputPresets(
  aiService: string,
): PromptImagePresetMap {
  const presets = getPromptImagePresetMap(aiService);

  return Object.fromEntries(
    MEDIA_ORIENTATIONS.filter((orientation) => Boolean(presets[orientation])).map(
      (orientation) => [orientation, presets[orientation]],
    ),
  ) as PromptImagePresetMap;
}

export function getPromptImageDefaultOrientation(
  aiService: string,
): MediaOrientation {
  return getPromptImageAllowedOrientations(aiService)[0] ?? 'vertical';
}

export function resolvePromptImageOrientation(
  aiService: string,
  orientation?: MediaOrientation,
): MediaOrientation {
  const resolvedOrientation =
    orientation ?? getPromptImageDefaultOrientation(aiService);
  const allowedOrientations = getPromptImageAllowedOrientations(aiService);

  if (!allowedOrientations.includes(resolvedOrientation)) {
    throw new Error(
      `Orientation "${resolvedOrientation}" is not allowed for image service "${aiService}". Allowed: ${allowedOrientations.join(', ')}`,
    );
  }

  return resolvedOrientation;
}

export function getPromptImageDimensions(
  aiService: string,
  orientation: MediaOrientation,
): PromptImageDimensions {
  const presets = getPromptImagePresetMap(aiService);
  const preset = presets[orientation];

  if (!preset) {
    throw new Error(
      `No prompt-image dimensions configured for aiService "${aiService}" and orientation "${orientation}"`,
    );
  }

  return preset;
}
