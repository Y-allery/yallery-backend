import { MediaOrientation } from '../presets';

export interface ImageVideoGenerationRequest {
  aiService: string;
  prompt: string;
  imageUrl: string;
  orientation: MediaOrientation;
  duration: number;
  contestId?: number | null;
}
