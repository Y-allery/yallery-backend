import { MediaCapability } from 'src/modules/media-generation/domain/enums/media-capability.enum';
import { MediaProvider } from 'src/modules/media-generation/domain/enums/media-provider.enum';
import { AudioGenerationRequest } from 'src/modules/media-generation/domain/contracts/audio-generation-request.contract';
import { AudioGenerationResult } from 'src/modules/media-generation/domain/contracts/audio-generation-result.contract';
import { EditImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/edit-image-generation-request.contract';
import { ImageVideoGenerationRequest } from 'src/modules/media-generation/domain/contracts/image-video-generation-request.contract';
import { MemeGenerationRequest } from 'src/modules/media-generation/domain/contracts/meme-generation-request.contract';
import { MemeGenerationResult } from 'src/modules/media-generation/domain/contracts/meme-generation-result.contract';
import { ResolvedPromptImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/prompt-image-generation-request.contract';
import { PromptImageGenerationResult } from 'src/modules/media-generation/domain/contracts/prompt-image-generation-result.contract';
import { TextVideoGenerationRequest } from 'src/modules/media-generation/domain/contracts/text-video-generation-request.contract';
import { VideoGenerationResult } from 'src/modules/media-generation/domain/contracts/video-generation-result.contract';

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
  generateMemes?(request: MemeGenerationRequest): Promise<MemeGenerationResult>;
}
