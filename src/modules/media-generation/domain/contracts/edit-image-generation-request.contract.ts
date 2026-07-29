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
  /**
   * The image being edited (the canvas). Always mirrors `imageUrls[0]` — kept required and
   * non-nullable so the nine existing consumers (post factory `generationParams.sourceImageUrl`,
   * which the notification gateway uses to recognise an edit, contest submissions, specs)
   * need no changes, and so BullMQ jobs enqueued before the multi-reference release stay valid.
   */
  imageUrl: string;
  /**
   * Ordered 1-3 references: [0] is the canvas, the rest supply a subject/object/style to
   * compose into it. Undefined on jobs enqueued before the multi-reference release — callers
   * must fall back to `[imageUrl]`.
   */
  imageUrls?: string[];
  contestId?: number | null;
  contestSubmissionId?: number | null;
  styleId?: number | null;
  colorId?: number | null;
  styleName?: string | null;
  colorName?: string | null;
}
