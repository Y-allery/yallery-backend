import { Injectable } from '@nestjs/common';
import { AudioGenerationRequest } from 'src/modules/media-generation/domain/contracts/audio-generation-request.contract';
import { EditImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/edit-image-generation-request.contract';
import { ImageVideoGenerationRequest } from 'src/modules/media-generation/domain/contracts/image-video-generation-request.contract';
import { MemeGenerationRequest } from 'src/modules/media-generation/domain/contracts/meme-generation-request.contract';
import { ResolvedPromptImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/prompt-image-generation-request.contract';
import { TextVideoGenerationRequest } from 'src/modules/media-generation/domain/contracts/text-video-generation-request.contract';
import { getVideoOutputPreset } from 'src/modules/media-generation/domain/presets';

const SDXL_BASELINE_NEGATIVE =
  'low quality, blurry, distorted, deformed, bad anatomy, extra limbs, text artifacts, watermark, logo';

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
    const { size, aspectRatio } = getVideoOutputPreset(
      request.aiService,
      request.orientation,
    );

    return {
      prompt: request.prompt,
      duration: request.duration,
      size,
      fps: 24,
      aspect_ratio: aspectRatio,
      draft: false,
      save_audio: true,
      prompt_upsampling: true,
      enable_safety_checker: true,
      seed: 0,
    };
  }

  buildImageVideoInput(request: ImageVideoGenerationRequest) {
    return {
      ...this.buildTextVideoInput(request),
      image: request.imageUrl,
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

  private clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min;
    }
    return Math.min(Math.max(value, min), max);
  }

  private mergeNegatives(baseline: string, extra?: string): string {
    const trimmed = extra?.trim();
    return trimmed ? `${baseline}, ${trimmed}` : baseline;
  }
}
