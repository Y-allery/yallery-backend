import { MediaOrientation } from 'src/modules/media-generation/domain/presets';

import { MediaVideoResolution } from './image-video-generation-request.contract';

export interface TextVideoGenerationRequest {
  aiService: string;
  prompt: string;
  orientation: MediaOrientation;
  duration: number;
  /** Output tier; defaults to the 720 product resolution when absent. */
  resolution?: MediaVideoResolution;
  seed?: number;
  contestId?: number | null;
  contestSubmissionId?: number | null;
}
