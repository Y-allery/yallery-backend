import { MediaGenerationContext } from 'src/media-generation/shared/media-generation-context.types';

export interface MediaImageGenerationRequest {
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  imageQuantity: number;
  profileKey: string;
  providerModel: string;
  context: MediaGenerationContext;
}
