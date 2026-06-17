export interface EditImageGenerationRequest {
  aiService: string;
  prompt: string;
  translatedPrompt?: string;
  resolvedPrompt?: string;
  resolvedNegativePrompt?: string;
  resolvedCfg?: number;
  resolvedSteps?: number;
  imageUrl: string;
  contestId?: number | null;
  contestSubmissionId?: number | null;
  styleId?: number | null;
  colorId?: number | null;
  styleName?: string | null;
  colorName?: string | null;
}
