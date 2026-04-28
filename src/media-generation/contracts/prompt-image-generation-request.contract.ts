import { ContestTypeEnum } from 'src/contest/types/contest.status.enum';
import { MediaOrientation } from '../presets';

export interface PromptImageGenerationRequest {
  aiService?: string;
  prompt: string;
  translatedPrompt?: string;
  width?: number;
  height?: number;
  imageQuantity: number;
  orientation?: MediaOrientation;
  contestId?: number | null;
  styleId?: number | null;
  colorId?: number | null;
  styleName?: string | null;
  colorName?: string | null;
  resolvedPrompt?: string;
  providerSettings?: {
    finetuneId?: string;
    finetuneStrength?: number;
    loraKey?: string;
    loraScale?: number;
    loraUrl?: string;
    triggerWord?: string;
    contestType?: ContestTypeEnum;
  } | null;
}

export interface ResolvedPromptImageGenerationRequest
  extends PromptImageGenerationRequest {
  aiService: string;
  width: number;
  height: number;
  orientation: MediaOrientation;
}
