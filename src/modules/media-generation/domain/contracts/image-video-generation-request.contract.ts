import { MediaOrientation } from 'src/modules/media-generation/domain/presets';

export interface ImageVideoGenerationRequest {
  aiService: string;
  prompt: string;
  imageUrl: string;
  orientation: MediaOrientation;
  duration: number;
  contestId?: number | null;
  contestSubmissionId?: number | null;
}
