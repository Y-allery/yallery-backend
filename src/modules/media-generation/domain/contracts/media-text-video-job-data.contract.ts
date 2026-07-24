import { TextVideoGenerationRequest } from './text-video-generation-request.contract';
import { LtxTextPipelineMode } from './ltx-text-pipeline-mode.contract';

/**
 * The mode is an enqueue-time snapshot. Runtime switches only affect new jobs;
 * retries and already-queued jobs keep the behavior they were created with.
 */
export interface MediaTextVideoJobData {
  request: TextVideoGenerationRequest;
  userId: number;
  aiService: string;
  chargeId?: string;
  ltxTextPipelineMode: LtxTextPipelineMode;
}
