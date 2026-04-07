import { MediaCapability } from '../enums/media-capability.enum';
import { MediaProvider } from '../enums/media-provider.enum';
import { AudioGenerationRequest } from './audio-generation-request.contract';
import { AudioGenerationResult } from './audio-generation-result.contract';
import { EditImageGenerationRequest } from './edit-image-generation-request.contract';
import { ImageVideoGenerationRequest } from './image-video-generation-request.contract';
import { ResolvedPromptImageGenerationRequest } from './prompt-image-generation-request.contract';
import { PromptImageGenerationResult } from './prompt-image-generation-result.contract';
import { TextVideoGenerationRequest } from './text-video-generation-request.contract';
import { VideoGenerationResult } from './video-generation-result.contract';

export interface MediaGenerationProvider {
  readonly provider: MediaProvider;
  readonly capabilities: MediaCapability[];
  generatePromptImages?(
    request: ResolvedPromptImageGenerationRequest,
  ): Promise<PromptImageGenerationResult>;
  editImages?(
    request: EditImageGenerationRequest,
  ): Promise<PromptImageGenerationResult>;
  generateAudio?(
    request: AudioGenerationRequest,
  ): Promise<AudioGenerationResult>;
  generateTextVideos?(
    request: TextVideoGenerationRequest,
  ): Promise<VideoGenerationResult>;
  generateImageVideos?(
    request: ImageVideoGenerationRequest,
  ): Promise<VideoGenerationResult>;
}
