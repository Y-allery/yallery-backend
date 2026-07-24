import { BadRequestException, Injectable } from '@nestjs/common';
import {
  UploadedVideoAsset,
  UploadService,
} from 'src/modules/uploads/upload.service';
import { AudioGenerationRequest } from 'src/modules/media-generation/domain/contracts/audio-generation-request.contract';
import { AudioGenerationResult } from 'src/modules/media-generation/domain/contracts/audio-generation-result.contract';
import { EditImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/edit-image-generation-request.contract';
import { ImageVideoGenerationRequest } from 'src/modules/media-generation/domain/contracts/image-video-generation-request.contract';
import { MediaGenerationProvider } from 'src/modules/media-generation/domain/contracts/media-generation-provider.contract';
import { MemeGenerationRequest } from 'src/modules/media-generation/domain/contracts/meme-generation-request.contract';
import { MemeGenerationResult } from 'src/modules/media-generation/domain/contracts/meme-generation-result.contract';
import { PromptImageGenerationResult } from 'src/modules/media-generation/domain/contracts/prompt-image-generation-result.contract';
import { ResolvedPromptImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/prompt-image-generation-request.contract';
import { TextVideoGenerationRequest } from 'src/modules/media-generation/domain/contracts/text-video-generation-request.contract';
import { VideoGenerationResult } from 'src/modules/media-generation/domain/contracts/video-generation-result.contract';
import { MediaCapability } from 'src/modules/media-generation/domain/enums/media-capability.enum';
import { MediaProvider } from 'src/modules/media-generation/domain/enums/media-provider.enum';
import { KreaContentSafetyService } from 'src/modules/media-generation/application/content-safety/krea-content-safety.service';
import * as sharp from 'sharp';
import {
  getVideoOutputPreset,
  MediaOrientation,
} from 'src/modules/media-generation/domain/presets';
import { RunpodEndpointResolver } from './runpod-endpoint.resolver';
import { RunpodMediaClient } from './runpod-media.client';
import { RunpodJobResponse } from './runpod-media.types';
import { RunpodOutputExtractor } from './runpod-output.extractor';
import { RunpodPayloadBuilder } from './runpod-payload.builder';
import { RunpodTimeoutPolicyService } from './runpod-timeout-policy.service';

@Injectable()
export class RunpodOpenEndpointMediaProvider
  implements MediaGenerationProvider
{
  readonly provider = MediaProvider.RUNPOD;

  constructor(
    private readonly client: RunpodMediaClient,
    private readonly endpoints: RunpodEndpointResolver,
    private readonly extractor: RunpodOutputExtractor,
    private readonly payloadBuilder: RunpodPayloadBuilder,
    private readonly timeoutPolicy: RunpodTimeoutPolicyService,
    private readonly contentSafety: KreaContentSafetyService,
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
    await this.contentSafety.assertPromptAllowed(
      request.aiService,
      request.prompt,
    );
    const endpointId =
      await this.endpoints.getEndpointIdForPromptImageRequest(request);
    // Per-route API key: selected image routes can live on the second RunPod account.
    const apiKeyConfigKey = this.endpoints.getApiKeyConfigKey(
      request.aiService,
      'promptImage',
    );
    const initialJob = await this.client.submitJob(
      endpointId,
      {
        input: this.payloadBuilder.buildPromptImageInput(request),
      },
      apiKeyConfigKey,
    );
    const completedJob = await this.client.waitForCompletion(
      endpointId,
      initialJob,
      this.extractor.hasExtractableImageSource.bind(this.extractor),
      await this.timeoutPolicy.getStatusTimeoutMs(
        request.aiService,
        'promptImage',
      ),
      apiKeyConfigKey,
    );
    const providerImageSources = this.extractor.extractImageSources(
      completedJob.output,
    );
    await this.contentSafety.assertProviderImagesAllowed(
      request.aiService,
      providerImageSources,
    );
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
    const endpointId =
      await this.endpoints.getEndpointIdForImageEditRequest(request);
    // Async /run + polling (not /runsync): RunPod caps runsync at ~90s and returns a
    // non-terminal status with no output, which loses every edit that hits a cold start
    // on an endpoint that scales to zero. Polling tolerates cold starts like the other routes.
    const initialJob = await this.client.submitJob(endpointId, {
      input: this.payloadBuilder.buildImageEditInput(request),
    });
    const completedJob = await this.client.waitForCompletion(
      endpointId,
      initialJob,
      this.extractor.hasExtractableImageSource.bind(this.extractor),
      await this.timeoutPolicy.getStatusTimeoutMs(
        request.aiService,
        'imageEdit',
      ),
    );
    const providerImageSources = this.extractor.extractImageSources(
      completedJob.output,
    );
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

    const normalizedRequest = { ...request, prompt, videoUrl };
    const endpointId =
      await this.endpoints.getEndpointIdForAudioRequest(normalizedRequest);
    const initialJob = await this.client.submitJob(endpointId, {
      input: this.payloadBuilder.buildAudioInput(normalizedRequest),
    });
    const completedJob = await this.waitForVideo(
      endpointId,
      initialJob,
      request.aiService,
      'audio',
    );
    const providerVideoSource = this.extractor.extractVideoSource(
      completedJob.output,
    );
    const uploadedVideoAsset =
      await this.uploadService.uploadVideoAssetByUrl(providerVideoSource);

    return {
      videoUrl: uploadedVideoAsset.videoUrl,
      previewImageUrl: uploadedVideoAsset.previewImageUrl,
      width: uploadedVideoAsset.width,
      height: uploadedVideoAsset.height,
      hasAudio: uploadedVideoAsset.hasAudio,
      rawOutput: completedJob.output,
    };
  }

  async generateTextVideos(
    request: TextVideoGenerationRequest,
  ): Promise<VideoGenerationResult> {
    const endpointId =
      await this.endpoints.getEndpointIdForTextVideoRequest(request);
    const apiKeyConfigKey = this.endpoints.getApiKeyConfigKey(
      request.aiService,
      'textVideo',
    );
    const initialJob = await this.client.submitJob(
      endpointId,
      { input: this.payloadBuilder.buildTextVideoInput(request) },
      apiKeyConfigKey,
    );
    const completedJob = await this.waitForVideo(
      endpointId,
      initialJob,
      request.aiService,
      'textVideo',
      apiKeyConfigKey,
    );
    const providerVideoSource = this.extractor.extractVideoSource(
      completedJob.output,
    );
    const uploadedVideoAsset =
      await this.uploadService.uploadVideoAssetByUrl(providerVideoSource);

    return {
      videoUrl: uploadedVideoAsset.videoUrl,
      previewImageUrl: uploadedVideoAsset.previewImageUrl,
      ...this.resolvePresetBackedVideoDimensions(request, uploadedVideoAsset),
      hasAudio: uploadedVideoAsset.hasAudio,
      rawOutput: completedJob.output,
    };
  }

  async generateImageVideos(
    request: ImageVideoGenerationRequest,
  ): Promise<VideoGenerationResult> {
    const endpointId =
      await this.endpoints.getEndpointIdForImageVideoRequest(request);
    const apiKeyConfigKey = this.endpoints.getApiKeyConfigKey(
      request.aiService,
      'imageVideo',
    );
    // i2v inlines the source image as bare base64 (`image_b64`); the video orientation is
    // derived from the (EXIF-normalised) image itself, since the app sends no real orientation.
    const { imageBase64, orientation } = await this.prepareImageVideoSource(
      request.imageUrl,
    );
    const videoRequest: ImageVideoGenerationRequest = {
      ...request,
      orientation,
    };
    const initialJob = await this.client.submitJob(
      endpointId,
      {
        input: this.payloadBuilder.buildImageVideoInput(
          videoRequest,
          imageBase64,
        ),
      },
      apiKeyConfigKey,
    );
    const completedJob = await this.waitForVideo(
      endpointId,
      initialJob,
      request.aiService,
      'imageVideo',
      apiKeyConfigKey,
    );
    const providerVideoSource = this.extractor.extractVideoSource(
      completedJob.output,
    );
    const uploadedVideoAsset =
      await this.uploadService.uploadVideoAssetByUrl(providerVideoSource);

    return {
      videoUrl: uploadedVideoAsset.videoUrl,
      previewImageUrl: uploadedVideoAsset.previewImageUrl,
      ...this.resolvePresetBackedVideoDimensions(
        videoRequest,
        uploadedVideoAsset,
      ),
      hasAudio: uploadedVideoAsset.hasAudio,
      rawOutput: completedJob.output,
    };
  }

  /**
   * Download the i2v source image, normalise EXIF rotation (so the worker gets upright pixels),
   * bound its size for payload sanity, and derive the video orientation from the real
   * post-rotation aspect ratio — a portrait photo must yield a portrait clip.
   */
  private async prepareImageVideoSource(
    imageUrl: string,
  ): Promise<{ imageBase64: string; orientation: MediaOrientation }> {
    const buffer = await this.client.fetchBinary(imageUrl);
    const { data, info } = await sharp(buffer)
      .rotate()
      .resize(1536, 1536, { fit: 'inside', withoutEnlargement: true })
      .toBuffer({ resolveWithObject: true });
    const orientation: MediaOrientation =
      info.height > info.width ? 'vertical' : 'horizontal';

    return { imageBase64: data.toString('base64'), orientation };
  }

  private async buildLtxMemeSubmitInput(request: MemeGenerationRequest) {
    const { imageBase64, orientation } = await this.prepareImageVideoSource(
      request.imageUrl,
    );

    return this.payloadBuilder.buildLtxMemeInput(
      request,
      imageBase64,
      orientation,
    );
  }

  async generateMemes(
    request: MemeGenerationRequest,
  ): Promise<MemeGenerationResult> {
    const endpointId =
      await this.endpoints.getEndpointIdForMemeRequest(request);
    const apiKeyConfigKey = this.endpoints.getApiKeyConfigKey(
      request.aiService,
      'meme',
    );
    // ltx_meme (worker v8.20): inline character image + reference video as base64; the WAN
    // worker keeps taking URLs. The character image goes through the same EXIF-normalising
    // prep as i2v, and its aspect picks the output orientation.
    const input =
      request.aiService === 'ltx_meme'
        ? await this.buildLtxMemeSubmitInput(request)
        : this.payloadBuilder.buildMemeInput(request);
    const initialJob = await this.client.submitJob(
      endpointId,
      { input },
      apiKeyConfigKey,
    );
    const completedJob = await this.waitForVideo(
      endpointId,
      initialJob,
      request.aiService,
      'meme',
      apiKeyConfigKey,
    );
    const providerVideoSource = this.extractor.extractVideoSource(
      completedJob.output,
    );
    const uploadedVideoAsset =
      await this.uploadService.uploadVideoAssetByUrl(providerVideoSource);

    return {
      videoUrl: uploadedVideoAsset.videoUrl,
      previewImageUrl: uploadedVideoAsset.previewImageUrl,
      width: uploadedVideoAsset.width,
      height: uploadedVideoAsset.height,
      hasAudio: uploadedVideoAsset.hasAudio,
      rawOutput: completedJob.output,
    };
  }

  private async waitForVideo(
    endpointId: string,
    initialJob: RunpodJobResponse,
    aiService: string,
    routeType: 'audio' | 'textVideo' | 'imageVideo' | 'meme',
    apiKeyConfigKey?: string,
  ) {
    return await this.client.waitForCompletion(
      endpointId,
      initialJob,
      this.extractor.hasExtractableVideoSource.bind(this.extractor),
      await this.timeoutPolicy.getStatusTimeoutMs(aiService, routeType),
      apiKeyConfigKey,
    );
  }

  private resolvePresetBackedVideoDimensions(
    request: TextVideoGenerationRequest | ImageVideoGenerationRequest,
    asset: UploadedVideoAsset,
  ): { width: number | null; height: number | null } {
    const preset = getVideoOutputPreset(request.aiService, request.orientation);

    return {
      width: asset.width ?? preset.width,
      height: asset.height ?? preset.height,
    };
  }
}
