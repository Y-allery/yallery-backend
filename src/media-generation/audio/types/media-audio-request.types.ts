export interface MediaAudioGenerationRequest {
  videoUrl: string;
  prompt: string;
  aiService: string;
  duration: number;
  contestId: number | null;
}
