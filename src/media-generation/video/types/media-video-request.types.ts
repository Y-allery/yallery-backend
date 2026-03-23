export interface MediaVideoGenerationRequest {
  imageUrl: string | null;
  prompt: string;
  aiService: string;
  duration: number;
  contestId: number | null;
}
