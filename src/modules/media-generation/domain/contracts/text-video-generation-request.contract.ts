import { MediaOrientation } from 'src/modules/media-generation/domain/presets';

export interface TextVideoGenerationRequest {
  aiService: string;
  prompt: string;
  orientation: MediaOrientation;
  duration: number;
  seed?: number;
  contestId?: number | null;
  contestSubmissionId?: number | null;
}
