import { Injectable } from '@nestjs/common';
import { AI_SERVICES } from 'src/modules/media-generation/domain/ai-service.catalog';
import { AudioGenerationRequest } from 'src/modules/media-generation/domain/contracts/audio-generation-request.contract';
import { EditImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/edit-image-generation-request.contract';
import { ImageVideoGenerationRequest } from 'src/modules/media-generation/domain/contracts/image-video-generation-request.contract';
import { MemeGenerationRequest } from 'src/modules/media-generation/domain/contracts/meme-generation-request.contract';
import { MAX_EDIT_REFERENCE_IMAGES } from 'src/modules/media-generation/domain/constants/image-edit.constants';
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
      case AI_SERVICES.PHOTO_LITE:
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
      case AI_SERVICES.PHOTO_V1:
      // 2026-07-24 t2i battery candidates C/D: same worker payload shape as qwen_image
      // (prompt/style/width/height/num_images/output_format/return_base64/return_data_uri).
      // Dark by default via provider-settings (see media-route.catalog.ts).
      case AI_SERVICES.PHOTO_V2:
      case AI_SERVICES.PHOTO:
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
      case AI_SERVICES.PHOTO_PRO:
        return {
          prompt,
          style,
          width: request.width,
          height: request.height,
          numImages: request.imageQuantity,
          numInferenceSteps: 8,
          guidanceScale: 0,
          mu: 1.15,
          outputFormat: 'png',
          upload: true,
          returnBase64: false,
        };
      case AI_SERVICES.PORTRAIT:
        if (
          !request.providerSettings?.loraUrl ||
          !request.providerSettings?.loraKey ||
          !request.providerSettings?.triggerWord ||
          !request.providerSettings?.loraSha256 ||
          !request.providerSettings?.loraStep ||
          request.providerSettings?.inferenceModel !== 'krea/Krea-2-Turbo'
        ) {
          throw new Error(
            'krea2_lora_generation requires a Krea 2 Turbo-compatible LoRA artifact',
          );
        }

        return {
          prompt,
          style,
          triggerWord: request.providerSettings.triggerWord,
          loraUrl: request.providerSettings.loraUrl,
          loraKey: request.providerSettings.loraKey,
          loraScale: request.providerSettings.loraScale ?? 0.9,
          loraSha256: request.providerSettings.loraSha256,
          loraStep: request.providerSettings.loraStep,
          width: request.width,
          height: request.height,
          numImages: request.imageQuantity,
          numInferenceSteps: 8,
          guidanceScale: 0,
          mu: 1.15,
          outputFormat: 'png',
          upload: true,
          returnBase64: false,
        };
      default:
        throw new Error(
          `RunPod prompt-image service ${request.aiService} is not configured`,
        );
    }
  }

  buildImageEditInput(request: EditImageGenerationRequest) {
    // Raw instruction + style; the Qwen worker's upsampler shapes it and owns steps/cfg/negatives.
    // References: [0] is the canvas, [1..2] are extra references composed into it. The fallback
    // to [imageUrl] keeps BullMQ jobs enqueued before the multi-reference release valid on retry.
    const references = (
      request.imageUrls?.length ? request.imageUrls : [request.imageUrl]
    )
      .filter(Boolean)
      .slice(0, MAX_EDIT_REFERENCE_IMAGES);

    return {
      prompt: request.prompt,
      style: request.style ?? undefined,
      // Both fields on purpose: the new worker reads image_urls, while a rolled-back worker
      // still finds the scalar and degrades to a single-reference edit instead of failing.
      image_url: references[0],
      image_urls: references,
      // OUTPUT count — deliberately unrelated to the number of reference images above.
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
      // CAS is spatial-only and amplified motion artifacts in the fixed July battery.
      // Do not send decode_noise: the v8.23.1 override is a confirmed no-op, and silently
      // activating 0.05 after a worker-side wiring fix would be an untested behavior change.
      cas_amount: 0,
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

  buildLtxMemeInput(
    request: MemeGenerationRequest,
    imageBase64: string,
    orientation: MediaOrientation,
  ) {
    // LTX worker v8.20.4+ meme mode: DWPose of the reference video + Union IC-LoRA. Dims must
    // be divisible by 128 (the reference is VAE-encoded at half resolution); the worker derives
    // frame count from the reference length itself, and remuxes the meme's own audio.
    // The reference goes by URL — RunPod /run caps payloads at 10MB and a 10s meme in base64
    // blows past it; only the (EXIF-normalised) character image is inlined.
    const { width, height } =
      orientation === 'horizontal'
        ? { width: 1152, height: 640 }
        : { width: 640, height: 1152 };

    return {
      prompt: request.prompt?.trim() || '',
      image_b64: imageBase64,
      reference_video_url: request.videoUrl,
      width,
      height,
      fps: 24,
      audio: false,
      preserve_source_audio: true,
      tier: 'quality',
      seed: randomVideoSeed(),
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
    // LTX video frame counts follow 8k+1: 121 and 241 align the intended ~5s and ~10s
    // tiers at 24fps. Sending 240 can be truncated to 233 frames by the decoder.
    return duration >= 8 ? 241 : 121;
  }
}
