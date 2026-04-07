export interface EditImageGenerationRequest {
  aiService: string;
  prompt: string;
  translatedPrompt?: string;
  resolvedPrompt?: string;
  imageUrl: string;
  contestId?: number | null;
  styleId?: number | null;
  colorId?: number | null;
  styleName?: string | null;
  colorName?: string | null;
}
