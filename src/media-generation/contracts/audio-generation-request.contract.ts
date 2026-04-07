export interface AudioGenerationRequest {
  aiService: string;
  prompt: string;
  videoUrl: string;
  contestId?: number | null;
}
