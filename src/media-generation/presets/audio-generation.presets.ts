export type AudioGenerationPreset = {
  producesVideoAsset: boolean;
  generatePreviewFromVideo: boolean;
};

const DEFAULT_AUDIO_GENERATION_PRESET: AudioGenerationPreset = {
  producesVideoAsset: true,
  generatePreviewFromVideo: true,
};

const AUDIO_PRESET_OVERRIDES: Record<string, Partial<AudioGenerationPreset>> = {};

export function getAudioGenerationPreset(aiService: string): AudioGenerationPreset {
  return {
    ...DEFAULT_AUDIO_GENERATION_PRESET,
    ...AUDIO_PRESET_OVERRIDES[aiService],
  };
}
