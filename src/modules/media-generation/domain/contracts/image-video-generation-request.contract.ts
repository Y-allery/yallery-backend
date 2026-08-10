import { MediaOrientation } from 'src/modules/media-generation/domain/presets';

/** The video tiers the LTX worker is validated for. */
export type MediaVideoResolution = '720p' | '1080p';

export interface ImageVideoGenerationRequest {
  aiService: string;
  prompt: string;
  imageUrl: string;
  orientation: MediaOrientation;
  duration: number;
  /** Output tier; defaults to the 720 product resolution when absent. */
  resolution?: MediaVideoResolution;
  seed?: number;
  contestId?: number | null;
  contestSubmissionId?: number | null;
}
