import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { UploadService } from 'src/upload/upload.service';
import { MediaGenerationProvider } from '../../contracts/media-generation-provider.contract';
import { AudioGenerationRequest } from '../../contracts/audio-generation-request.contract';
import { AudioGenerationResult } from '../../contracts/audio-generation-result.contract';
import { EditImageGenerationRequest } from '../../contracts/edit-image-generation-request.contract';
import { ImageVideoGenerationRequest } from '../../contracts/image-video-generation-request.contract';
import { MemeGenerationRequest } from '../../contracts/meme-generation-request.contract';
import { MemeGenerationResult } from '../../contracts/meme-generation-result.contract';
import { PromptImageGenerationResult } from '../../contracts/prompt-image-generation-result.contract';
import { ResolvedPromptImageGenerationRequest } from '../../contracts/prompt-image-generation-request.contract';
import { TextVideoGenerationRequest } from '../../contracts/text-video-generation-request.contract';
import { VideoGenerationResult } from '../../contracts/video-generation-result.contract';
import { MediaCapability } from '../../enums/media-capability.enum';
import { MediaProvider } from '../../enums/media-provider.enum';
import { getVideoOutputPreset } from '../../presets';

type RunpodJobStatus =
  | 'IN_QUEUE'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'TIMED_OUT';

interface RunpodJobResponse {
  id: string;
  status: RunpodJobStatus;
  output?: unknown;
  error?: string;
  delayTime?: number;
  executionTime?: number;
}

@Injectable()
export class RunpodOpenEndpointMediaProvider implements MediaGenerationProvider {
  readonly provider = MediaProvider.RUNPOD;

  constructor(
    private readonly configService: ConfigService,
    private readonly uploadService: UploadService,
  ) {}

  readonly capabilities = [
    MediaCapability.IMAGE_GENERATE,
    MediaCapability.IMAGE_EDIT,
    MediaCapability.AUDIO_GENERATE,
    MediaCapability.VIDEO_GENERATE,
    MediaCapability.MEME_GENERATE,
  ];

  async generatePromptImages(
    request: ResolvedPromptImageGenerationRequest,
  ): Promise<PromptImageGenerationResult> {
    const endpointId = this.getEndpointIdForPromptImageRequest(request);

    const initialJob = await this.submitJob(endpointId, {
      input: this.buildPromptImageInput(request),
    });
    const completedJob = await this.waitForCompletion(endpointId, initialJob);
    const providerImageSources = this.extractImageSources(completedJob.output);
    const uploadedImageUrls = await Promise.all(
      providerImageSources.map(async (imageSource) => {
        return await this.uploadService.uploadByUrl(imageSource);
      }),
    );

    return {
      imageUrls: uploadedImageUrls,
      rawOutput: completedJob.output,
    };
  }

  async editImages(
    request: EditImageGenerationRequest,
  ): Promise<PromptImageGenerationResult> {
    const endpointId = this.getEndpointIdForImageEditRequest(request);
    const completedJob = await this.submitSyncJob(
      endpointId,
      this.buildImageEditInput(request),
    );
    const providerImageSources = this.extractImageSources(completedJob.output);
    const uploadedImageUrls = await Promise.all(
      providerImageSources.map(async (imageSource) => {
        return await this.uploadService.uploadByUrl(imageSource);
      }),
    );

    return {
      imageUrls: uploadedImageUrls,
      rawOutput: completedJob.output,
    };
  }

  async generateAudio(
    request: AudioGenerationRequest,
  ): Promise<AudioGenerationResult> {
    const prompt = request.prompt.trim();
    const videoUrl = request.videoUrl.trim();
    if (!prompt) {
      throw new BadRequestException('prompt is required');
    }
    if (!videoUrl) {
      throw new BadRequestException('videoUrl is required');
    }

    const endpointId = this.getEndpointIdForAudioRequest(request);
    const initialJob = await this.submitJob(endpointId, {
      input: this.buildAudioInput({ ...request, prompt, videoUrl }),
    });
    const completedJob = await this.waitForCompletion(
      endpointId,
      initialJob,
      'video',
    );
    const providerVideoSource = this.extractVideoSource(completedJob.output);
    const uploadedVideoUrl =
      await this.uploadService.uploadVideoByUrl(providerVideoSource);

    return {
      videoUrl: uploadedVideoUrl,
      rawOutput: completedJob.output,
    };
  }

  async generateTextVideos(
    request: TextVideoGenerationRequest,
  ): Promise<VideoGenerationResult> {
    const endpointId = this.getEndpointIdForTextVideoRequest(request);
    const initialJob = await this.submitJob(endpointId, {
      input: this.buildTextVideoInput(request),
    });
    const completedJob = await this.waitForCompletion(
      endpointId,
      initialJob,
      'video',
    );
    const providerVideoSource = this.extractVideoSource(completedJob.output);
    const uploadedVideoUrl =
      await this.uploadService.uploadVideoByUrl(providerVideoSource);

    return {
      videoUrl: uploadedVideoUrl,
      rawOutput: completedJob.output,
    };
  }

  async generateImageVideos(
    request: ImageVideoGenerationRequest,
  ): Promise<VideoGenerationResult> {
    const endpointId = this.getEndpointIdForImageVideoRequest(request);
    const initialJob = await this.submitJob(endpointId, {
      input: this.buildImageVideoInput(request),
    });
    const completedJob = await this.waitForCompletion(
      endpointId,
      initialJob,
      'video',
    );
    const providerVideoSource = this.extractVideoSource(completedJob.output);
    const uploadedVideoUrl =
      await this.uploadService.uploadVideoByUrl(providerVideoSource);

    return {
      videoUrl: uploadedVideoUrl,
      rawOutput: completedJob.output,
    };
  }

  async generateMemes(
    request: MemeGenerationRequest,
  ): Promise<MemeGenerationResult> {
    const endpointId = this.getEndpointIdForMemeRequest(request);
    const initialJob = await this.submitJob(endpointId, {
      input: this.buildMemeInput(request),
    });
    const completedJob = await this.waitForCompletion(
      endpointId,
      initialJob,
      'video',
    );
    const providerVideoSource = this.extractVideoSource(completedJob.output);
    const uploadedVideoUrl =
      await this.uploadService.uploadVideoByUrl(providerVideoSource);

    return {
      videoUrl: uploadedVideoUrl,
      rawOutput: completedJob.output,
    };
  }

  private async submitJob(
    endpointId: string,
    payload: { input: Record<string, unknown> },
  ): Promise<RunpodJobResponse> {
    const response = await axios.post<RunpodJobResponse>(
      `${this.getApiBaseUrl()}/${endpointId}/run`,
      payload,
      {
        headers: this.getHeaders(),
        timeout: this.getRequestTimeoutMs(),
      },
    );

    return response.data;
  }

  private async submitSyncJob(
    endpointId: string,
    input: Record<string, unknown>,
  ): Promise<RunpodJobResponse> {
    const response = await axios.post<RunpodJobResponse>(
      `${this.getApiBaseUrl()}/${endpointId}/runsync`,
      {
        input,
      },
      {
        headers: this.getHeaders(),
        timeout: this.getSyncRequestTimeoutMs(),
      },
    );

    return response.data;
  }

  private async waitForCompletion(
    endpointId: string,
    initialJob: RunpodJobResponse,
    outputType: 'image' | 'video' = 'image',
  ): Promise<RunpodJobResponse> {
    let currentJob = initialJob;
    const startedAt = Date.now();
    let completedWithoutOutputPolls = 0;
    const hasExtractableOutput =
      outputType === 'video'
        ? this.hasExtractableVideoSource.bind(this)
        : this.hasExtractableImageSource.bind(this);

    while (true) {
      if (currentJob.status === 'COMPLETED') {
        if (hasExtractableOutput(currentJob.output)) {
          return currentJob;
        }

        completedWithoutOutputPolls += 1;
        if (completedWithoutOutputPolls > this.getCompletedOutputRetryCount()) {
          throw new BadGatewayException(
            `RunPod job ${currentJob.id} completed without output after ${completedWithoutOutputPolls} status checks`,
          );
        }

        await this.sleep(this.getCompletedOutputRetryDelayMs());
        currentJob = await this.fetchJobStatus(endpointId, currentJob.id);
        continue;
      }

      if (
        currentJob.status === 'FAILED' ||
        currentJob.status === 'CANCELLED' ||
        currentJob.status === 'TIMED_OUT'
      ) {
        throw new BadGatewayException(
          `RunPod job ${currentJob.id} failed with status ${currentJob.status}${currentJob.error ? `: ${currentJob.error}` : ''}`,
        );
      }

      if (Date.now() - startedAt > this.getStatusTimeoutMs(outputType)) {
        throw new GatewayTimeoutException(
          `RunPod job ${currentJob.id} did not finish within ${this.getStatusTimeoutMs(outputType)}ms`,
        );
      }

      await this.sleep(this.getPollIntervalMs());
      currentJob = await this.fetchJobStatus(endpointId, currentJob.id);
    }
  }

  private async fetchJobStatus(
    endpointId: string,
    jobId: string,
  ): Promise<RunpodJobResponse> {
    const response = await axios.get<RunpodJobResponse>(
      `${this.getApiBaseUrl()}/${endpointId}/status/${jobId}`,
      {
        headers: this.getHeaders(),
        timeout: this.getRequestTimeoutMs(),
      },
    );

    return response.data;
  }

  private extractImageSources(output: unknown): string[] {
    const candidates: string[] = [];

    const collect = (value: unknown) => {
      if (!value) {
        return;
      }

      if (typeof value === 'string') {
        if (this.isSupportedImageSource(value)) {
          candidates.push(value);
        }
        return;
      }

      if (Array.isArray(value)) {
        value.forEach(collect);
        return;
      }

      if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        collect(record.image_url);
        collect(record.imageUrl);
        collect(record.data_uri);
        collect(record.url);
        collect(record.result);
        collect(record.images);
        collect(record.output);
        collect(record.data);

        if (
          typeof record.base64 === 'string' &&
          typeof record.format === 'string'
        ) {
          const format = record.format === 'jpg' ? 'jpeg' : record.format;
          collect(`data:image/${format};base64,${record.base64}`);
        }
      }
    };

    collect(output);

    const uniqueUrls = [...new Set(candidates)];

    if (uniqueUrls.length === 0) {
      throw new BadGatewayException(
        `RunPod response did not include image URLs: ${JSON.stringify(output)}`,
      );
    }

    return uniqueUrls;
  }

  private hasExtractableImageSource(output: unknown): boolean {
    try {
      return this.extractImageSources(output).length > 0;
    } catch {
      return false;
    }
  }

  private isSupportedImageSource(value: string): boolean {
    return value.startsWith('http') || value.startsWith('data:image/');
  }

  private extractVideoSource(output: unknown): string {
    const candidates: string[] = [];

    const collect = (value: unknown) => {
      if (!value) {
        return;
      }

      if (typeof value === 'string') {
        if (this.isSupportedVideoSource(value)) {
          candidates.push(value);
        }
        return;
      }

      if (Array.isArray(value)) {
        value.forEach(collect);
        return;
      }

      if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        collect(record.video);
        collect(record.video_url);
        collect(record.videoUrl);
        collect(record.videos);
        collect(record.url);
        collect(record.result);
        collect(record.output);
        collect(record.data);

        if (typeof record.base64 === 'string') {
          const format =
            typeof record.format === 'string' && record.format.startsWith('video/')
              ? record.format
              : 'video/mp4';
          collect(`data:${format};base64,${record.base64}`);
        }
      }
    };

    collect(output);

    const [firstVideo] = [...new Set(candidates)];

    if (!firstVideo) {
      throw new BadGatewayException(
        `RunPod response did not include video URLs: ${JSON.stringify(output)}`,
      );
    }

    return firstVideo;
  }

  private hasExtractableVideoSource(output: unknown): boolean {
    try {
      return Boolean(this.extractVideoSource(output));
    } catch {
      return false;
    }
  }

  private isSupportedVideoSource(value: string): boolean {
    return value.startsWith('http') || value.startsWith('data:video/');
  }

  private buildPromptImageInput(request: ResolvedPromptImageGenerationRequest) {
    const prompt = request.resolvedPrompt ?? request.prompt;

    switch (request.aiService) {
      case 'flux2_klein':
        return {
          prompt,
          num_inference_steps: 4,
          guidance_scale: 1,
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
          negative_prompt: '',
          num_inference_steps: 25,
          guidance_scale: 7,
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

  private buildImageEditInput(request: EditImageGenerationRequest) {
    return {
      prompt: request.resolvedPrompt ?? request.prompt,
      image_url: request.imageUrl,
      width: 1024,
      height: 1024,
      reference_max_side: 1024,
      num_inference_steps: 20,
      true_cfg_scale: 4,
      num_images: 1,
      output_format: 'png',
      return_base64: true,
      return_data_uri: true,
    };
  }

  private buildAudioInput(request: AudioGenerationRequest) {
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

  private buildTextVideoInput(request: TextVideoGenerationRequest) {
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

  private buildImageVideoInput(request: ImageVideoGenerationRequest) {
    return {
      ...this.buildTextVideoInput(request),
      image: request.imageUrl,
    };
  }

  private buildMemeInput(request: MemeGenerationRequest) {
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

  private getEndpointIdForPromptImageRequest(
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

  private getEndpointIdForImageEditRequest(
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

  private getEndpointIdForAudioRequest(
    request: AudioGenerationRequest,
  ): string {
    switch (request.aiService) {
      case 'mmaudio_v2':
        return this.getRequiredConfig('RUNPOD_MMAUDIO_ENDPOINT_ID');
      default:
        throw new Error(
          `RunPod audio endpoint is not configured for ${request.aiService}`,
        );
    }
  }

  private getEndpointIdForTextVideoRequest(
    request: TextVideoGenerationRequest,
  ): string {
    switch (request.aiService) {
      case 'p_video_text':
      default:
        return this.getRequiredConfig('RUNPOD_P_VIDEO_ENDPOINT_ID');
    }
  }

  private getEndpointIdForImageVideoRequest(
    request: ImageVideoGenerationRequest,
  ): string {
    switch (request.aiService) {
      case 'p_video_image':
      default:
        return this.getRequiredConfig('RUNPOD_P_VIDEO_ENDPOINT_ID');
    }
  }

  private getEndpointIdForMemeRequest(request: MemeGenerationRequest): string {
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

  private getApiBaseUrl(): string {
    return (
      this.configService.get<string>('RUNPOD_API_BASE_URL') ||
      'https://api.runpod.ai/v2'
    );
  }

  private getHeaders() {
    return {
      Authorization: `Bearer ${this.getRequiredConfig('RUNPOD_API_KEY')}`,
      'Content-Type': 'application/json',
    };
  }

  private getRequiredConfig(key: string): string {
    const value = this.configService.get<string>(key);

    if (!value) {
      throw new Error(`${key} is not configured`);
    }

    return value;
  }

  private getPollIntervalMs(): number {
    return Number(this.configService.get<string>('RUNPOD_POLL_INTERVAL_MS') || 5000);
  }

  private getStatusTimeoutMs(outputType: 'image' | 'video' = 'image'): number {
    const configuredValue = this.configService.get<string>(
      'RUNPOD_STATUS_TIMEOUT_MS',
    );

    if (configuredValue) {
      return Number(configuredValue);
    }

    return outputType === 'video' ? 1800000 : 600000;
  }

  private getRequestTimeoutMs(): number {
    return Number(this.configService.get<string>('RUNPOD_REQUEST_TIMEOUT_MS') || 30000);
  }

  private getSyncRequestTimeoutMs(): number {
    return Number(
      this.configService.get<string>('RUNPOD_SYNC_REQUEST_TIMEOUT_MS') ||
        this.getStatusTimeoutMs(),
    );
  }

  private getCompletedOutputRetryCount(): number {
    return Number(
      this.configService.get<string>('RUNPOD_COMPLETED_OUTPUT_RETRY_COUNT') || 6,
    );
  }

  private getCompletedOutputRetryDelayMs(): number {
    return Number(
      this.configService.get<string>('RUNPOD_COMPLETED_OUTPUT_RETRY_DELAY_MS') ||
        2000,
    );
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
