import { Injectable } from '@nestjs/common';
import { AudioGenerationRequest } from 'src/modules/media-generation/domain/contracts/audio-generation-request.contract';
import { EditImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/edit-image-generation-request.contract';
import { ImageVideoGenerationRequest } from 'src/modules/media-generation/domain/contracts/image-video-generation-request.contract';
import { MemeGenerationRequest } from 'src/modules/media-generation/domain/contracts/meme-generation-request.contract';
import { ResolvedPromptImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/prompt-image-generation-request.contract';
import { TextVideoGenerationRequest } from 'src/modules/media-generation/domain/contracts/text-video-generation-request.contract';
import {
  MediaOrientation,
  randomVideoSeed,
} from 'src/modules/media-generation/domain/presets';

// LTX video worker (2nd RunPod account). Dimensions must be multiples of 32; the 720 tier is
// the default product resolution. Frames snap to the worker's validated tiers @ 24fps.
const LTX_FPS = 24;
const LTX_DIMENSIONS_720: Record<
  MediaOrientation,
  { width: number; height: number }
> = {
  horizontal: { width: 1280, height: 704 },
  vertical: { width: 704, height: 1280 },
};

@Injectable()
export class RunpodPayloadBuilder {
  buildPromptImageInput(request: ResolvedPromptImageGenerationRequest) {
    // Raw user prompt + structured style; the worker's in-worker upsampler shapes the final
    // prompt and owns steps/cfg/negatives per model.
    const prompt = request.prompt;
    const style = request.style ?? undefined;

    switch (request.aiService) {
      case 'flux2_klein':
        return {
          prompt,
          style,
          width: request.width,
          height: request.height,
          num_images: request.imageQuantity,
          output_format: 'png',
          return_base64: true,
          return_data_uri: true,
        };
      case 'qwen_image':
        return {
          prompt,
          style,
          width: request.width,
          height: request.height,
          num_images: request.imageQuantity,
          output_format: 'png',
          return_base64: true,
          return_data_uri: true,
        };
      case 'sdxl':
        return {
          prompt,
          style,
          width: request.width,
          height: request.height,
          num_images: request.imageQuantity,
          output_format: 'png',
          return_base64: true,
          return_data_uri: true,
        };
      case 'sdxl_lora_generation':
        if (
          !request.providerSettings?.loraUrl ||
          !request.providerSettings?.loraKey ||
          !request.providerSettings?.triggerWord
        ) {
          throw new Error(
            'sdxl_lora_generation requires loraUrl, loraKey and triggerWord provider settings',
          );
        }

        return {
          prompt,
          triggerWord: request.providerSettings.triggerWord,
          loraUrl: request.providerSettings.loraUrl,
          loraKey: request.providerSettings.loraKey,
          loraScale: request.providerSettings.loraScale ?? 0.8,
          width: request.width,
          height: request.height,
          numImages: request.imageQuantity,
          negativePrompt: '',
          numInferenceSteps: 25,
          guidanceScale: 7,
          outputFormat: 'png',
          returnBase64: true,
          returnDataUri: true,
        };
      default:
        throw new Error(
          `RunPod prompt-image service ${request.aiService} is not configured`,
        );
    }
  }

  buildImageEditInput(request: EditImageGenerationRequest) {
    // Raw instruction + style; the Qwen worker's upsampler shapes it and owns steps/cfg/negatives.
    return {
      prompt: request.prompt,
      style: request.style ?? undefined,
      image_url: request.imageUrl,
      num_images: 1,
      output_format: 'png',
      return_base64: true,
      return_data_uri: true,
    };
  }

  buildAudioInput(request: AudioGenerationRequest) {
    return {
      video_url: request.videoUrl,
      prompt: request.prompt,
      negative_prompt: '',
      match_source_duration: true,
      return_base64: true,
      num_steps: 25,
      cfg_strength: 4.5,
    };
  }

  buildTextVideoInput(request: TextVideoGenerationRequest) {
    // LTX worker owns the prompt upsampler (enhance defaults on). The backend only maps
    // orientation -> 32-multiple dimensions and duration -> validated frame tier.
    // Jobs queued before the seed field existed fall back to a fresh random seed.
    const { width, height } = this.resolveLtxDimensions(request.orientation);

    return {
      prompt: request.prompt,
      width,
      height,
      frames: this.framesForDuration(request.duration),
      fps: LTX_FPS,
      audio: true,
      tier: 'quality',
      seed: request.seed ?? randomVideoSeed(),
    };
  }

  buildImageVideoInput(
    request: ImageVideoGenerationRequest,
    imageBase64: string,
  ) {
    // image_b64 must be bare base64 (no data: prefix); presence flips the worker to i2v.
    return {
      ...this.buildTextVideoInput(request),
      image_b64: imageBase64,
    };
  }

  buildMemeInput(request: MemeGenerationRequest) {
    return {
      prompt:
        request.prompt?.trim() ||
        'Make the character in the image follow the movements of the character in the video.',
      image_url: request.imageUrl,
      match_source_duration: true,
      motion_only: true,
      negative_prompt: request.negativePrompt?.trim() ?? '',
      output_frame_rate: 30,
      preserve_source_audio: true,
      return_base64: true,
      video_url: request.videoUrl,
    };
  }

  private resolveLtxDimensions(orientation: MediaOrientation): {
    width: number;
    height: number;
  } {
    return LTX_DIMENSIONS_720[orientation] ?? LTX_DIMENSIONS_720.horizontal;
  }

  private framesForDuration(duration: number): number {
    // LTX validated tiers @24fps: ~5s -> 121 frames, ~10s -> 240. Snap to the nearest tier.
    return duration >= 8 ? 240 : 121;
  }
}
