export type MemeCharacterOrientation = 'image' | 'video';

export interface MemeGenerationRequest {
  aiService: string;
  memeId: number;
  imageUrl: string;
  videoUrl: string;
  prompt?: string | null;
  negativePrompt?: string | null;
  characterOrientation?: MemeCharacterOrientation;
}
