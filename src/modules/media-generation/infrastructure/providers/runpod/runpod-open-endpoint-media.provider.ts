import { BadRequestException, Injectable } from '@nestjs/common';
import { UploadService } from 'src/modules/uploads/upload.service';
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
import { RunpodEndpointResolver } from './runpod-endpoint.resolver';
import { RunpodMediaClient } from './runpod-media.client';
import { RunpodJobResponse } from './runpod-media.types';
import { RunpodOutputExtractor } from './runpod-output.extractor';
import { RunpodPayloadBuilder } from './runpod-payload.builder';

@Injectable()
export class RunpodOpenEndpointMediaProvider implements MediaGenerationProvider {
  readonly provider = MediaProvider.RUNPOD;

  constructor(
    private readonly client: RunpodMediaClient,
    private readonly endpoints: RunpodEndpointResolver,
    private readonly extractor: RunpodOutputExtractor,
    private readonly payloadBuilder: RunpodPayloadBuilder,
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
    const endpointId = this.endpoints.getEndpointIdForPromptImageRequest(request);
    const initialJob = await this.client.submitJob(endpointId, {
      input: this.payloadBuilder.buildPromptImageInput(request),
    });
    const completedJob = await this.client.waitForCompletion(
      endpointId,
      initialJob,
      this.extractor.hasExtractableImageSource.bind(this.extractor),
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

  async editImages(
    request: EditImageGenerationRequest,
  ): Promise<PromptImageGenerationResult> {
    const endpointId = this.endpoints.getEndpointIdForImageEditRequest(request);
    const completedJob = await this.client.submitSyncJob(
      endpointId,
      this.payloadBuilder.buildImageEditInput(request),
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
    const endpointId = this.endpoints.getEndpointIdForAudioRequest(
      normalizedRequest,
    );
    const initialJob = await this.client.submitJob(endpointId, {
      input: this.payloadBuilder.buildAudioInput(normalizedRequest),
    });
    const completedJob = await this.waitForVideo(endpointId, initialJob);
    const providerVideoSource = this.extractor.extractVideoSource(
      completedJob.output,
    );
    const uploadedVideoAsset =
      await this.uploadService.uploadVideoAssetByUrl(providerVideoSource);

    return {
      videoUrl: uploadedVideoAsset.videoUrl,
      previewImageUrl: uploadedVideoAsset.previewImageUrl,
      rawOutput: completedJob.output,
    };
  }

  async generateTextVideos(
    request: TextVideoGenerationRequest,
  ): Promise<VideoGenerationResult> {
    const endpointId = this.endpoints.getEndpointIdForTextVideoRequest(request);
    const initialJob = await this.client.submitJob(endpointId, {
      input: this.payloadBuilder.buildTextVideoInput(request),
    });
    const completedJob = await this.waitForVideo(endpointId, initialJob);
    const providerVideoSource = this.extractor.extractVideoSource(
      completedJob.output,
    );
    const uploadedVideoAsset =
      await this.uploadService.uploadVideoAssetByUrl(providerVideoSource);

    return {
      videoUrl: uploadedVideoAsset.videoUrl,
      previewImageUrl: uploadedVideoAsset.previewImageUrl,
      rawOutput: completedJob.output,
    };
  }

  async generateImageVideos(
    request: ImageVideoGenerationRequest,
  ): Promise<VideoGenerationResult> {
    const endpointId = this.endpoints.getEndpointIdForImageVideoRequest(request);
    const initialJob = await this.client.submitJob(endpointId, {
      input: this.payloadBuilder.buildImageVideoInput(request),
    });
    const completedJob = await this.waitForVideo(endpointId, initialJob);
    const providerVideoSource = this.extractor.extractVideoSource(
      completedJob.output,
    );
    const uploadedVideoAsset =
      await this.uploadService.uploadVideoAssetByUrl(providerVideoSource);

    return {
      videoUrl: uploadedVideoAsset.videoUrl,
      previewImageUrl: uploadedVideoAsset.previewImageUrl,
      rawOutput: completedJob.output,
    };
  }

  async generateMemes(
    request: MemeGenerationRequest,
  ): Promise<MemeGenerationResult> {
    const endpointId = this.endpoints.getEndpointIdForMemeRequest(request);
    const initialJob = await this.client.submitJob(endpointId, {
      input: this.payloadBuilder.buildMemeInput(request),
    });
    const completedJob = await this.waitForVideo(endpointId, initialJob);
    const providerVideoSource = this.extractor.extractVideoSource(
      completedJob.output,
    );
    const uploadedVideoAsset =
      await this.uploadService.uploadVideoAssetByUrl(providerVideoSource);

    return {
      videoUrl: uploadedVideoAsset.videoUrl,
      previewImageUrl: uploadedVideoAsset.previewImageUrl,
      rawOutput: completedJob.output,
    };
  }

  private async waitForVideo(
    endpointId: string,
    initialJob: RunpodJobResponse,
  ) {
    return await this.client.waitForCompletion(
      endpointId,
      initialJob,
      this.extractor.hasExtractableVideoSource.bind(this.extractor),
      'video',
    );
  }
}
