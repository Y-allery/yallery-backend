import { MediaStyleDescriptor } from 'src/modules/media-generation/domain/contracts/media-style-descriptor.contract';
export interface EditImageGenerationRequest {
  aiService: string;
  prompt: string;
  /** Structured style for the worker's in-worker upsampler. */
  style?: MediaStyleDescriptor | null;
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
