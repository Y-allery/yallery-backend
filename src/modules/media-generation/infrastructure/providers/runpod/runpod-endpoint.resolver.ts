import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AudioGenerationRequest } from 'src/modules/media-generation/domain/contracts/audio-generation-request.contract';
import { EditImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/edit-image-generation-request.contract';
import { ImageVideoGenerationRequest } from 'src/modules/media-generation/domain/contracts/image-video-generation-request.contract';
import { MemeGenerationRequest } from 'src/modules/media-generation/domain/contracts/meme-generation-request.contract';
import { ResolvedPromptImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/prompt-image-generation-request.contract';
import { TextVideoGenerationRequest } from 'src/modules/media-generation/domain/contracts/text-video-generation-request.contract';

@Injectable()
export class RunpodEndpointResolver {
  constructor(private readonly configService: ConfigService) {}

  getEndpointIdForPromptImageRequest(
    request: ResolvedPromptImageGenerationRequest,
  ): string {
    switch (request.aiService) {
      case 'flux2_klein':
        return this.getRequiredConfig('RUNPOD_FLUX2_KLEIN_ENDPOINT_ID');
      case 'sdxl':
        return this.getRequiredConfig('RUNPOD_SDXL_ENDPOINT_ID');
      case 'sdxl_lora_generation':
        return this.getRequiredConfig(
          'RUNPOD_SDXL_LORA_GENERATION_ENDPOINT_ID',
        );
      default:
        throw new Error(
          `RunPod prompt-image endpoint is not configured for ${request.aiService}`,
        );
    }
  }

  getEndpointIdForImageEditRequest(
    request: EditImageGenerationRequest,
  ): string {
    switch (request.aiService) {
      case 'qwen_image_edit_baked':
        return this.getRequiredConfig(
          'RUNPOD_QWEN_IMAGE_EDIT_BAKED_ENDPOINT_ID',
        );
      default:
        throw new Error(
          `RunPod image-edit endpoint is not configured for ${request.aiService}`,
        );
    }
  }

  getEndpointIdForAudioRequest(request: AudioGenerationRequest): string {
    switch (request.aiService) {
      case 'mmaudio_v2':
        return this.getRequiredConfig('RUNPOD_MMAUDIO_ENDPOINT_ID');
      default:
        throw new Error(
          `RunPod audio endpoint is not configured for ${request.aiService}`,
        );
    }
  }

  getEndpointIdForTextVideoRequest(
    request: TextVideoGenerationRequest,
  ): string {
    switch (request.aiService) {
      case 'p_video_text':
      default:
        return this.getRequiredConfig('RUNPOD_P_VIDEO_ENDPOINT_ID');
    }
  }

  getEndpointIdForImageVideoRequest(
    request: ImageVideoGenerationRequest,
  ): string {
    switch (request.aiService) {
      case 'p_video_image':
      default:
        return this.getRequiredConfig('RUNPOD_P_VIDEO_ENDPOINT_ID');
    }
  }

  getEndpointIdForMemeRequest(request: MemeGenerationRequest): string {
    switch (request.aiService) {
      case 'wan22_animate_native':
        return this.getRequiredConfig(
          'RUNPOD_WAN22_ANIMATE_MEME_ENDPOINT_ID',
        );
      default:
        throw new Error(
          `RunPod meme endpoint is not configured for ${request.aiService}`,
        );
    }
  }

  private getRequiredConfig(key: string): string {
    const value = this.configService.get<string>(key);

    if (!value) {
      throw new Error(`${key} is not configured`);
    }

    return value;
  }
}
