import { MediaOrientation } from '../presets';

export interface TextVideoGenerationRequest {
  aiService: string;
  prompt: string;
  orientation: MediaOrientation;
  duration: number;
  contestId?: number | null;
}
