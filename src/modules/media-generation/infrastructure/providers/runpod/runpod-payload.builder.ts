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
    const prompt = request.resolvedPrompt ?? request.prompt;

    switch (request.aiService) {
      case 'flux2_klein':
        // Flux2-klein wants natural-language prompts and ignores negatives.
        // Keep its fast defaults unless the style explicitly recommends otherwise.
        return {
          prompt,
          num_inference_steps: this.clamp(request.resolvedSteps ?? 4, 1, 12),
          guidance_scale: this.clamp(request.resolvedCfg ?? 1, 0, 10),
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
          negative_prompt: this.mergeNegatives(
            SDXL_BASELINE_NEGATIVE,
            request.resolvedNegativePrompt,
          ),
          num_inference_steps: this.clamp(request.resolvedSteps ?? 35, 1, 80),
          guidance_scale: this.clamp(request.resolvedCfg ?? 7, 0, 20),
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
    // Qwen edit takes an imperative instruction; its CFG knob is `true_cfg_scale`.
    return {
      prompt: request.resolvedPrompt ?? request.prompt,
      image_url: request.imageUrl,
      width: 1024,
      height: 1024,
      reference_max_side: 1024,
      num_inference_steps: this.clamp(request.resolvedSteps ?? 20, 1, 50),
      true_cfg_scale: this.clamp(request.resolvedCfg ?? 4, 0, 10),
      negative_prompt: request.resolvedNegativePrompt?.trim() || ' ',
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
