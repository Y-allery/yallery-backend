import { Injectable, NotImplementedException } from '@nestjs/common';
import { AudioGenerationRequest } from 'src/modules/media-generation/domain/contracts/audio-generation-request.contract';
import { AudioGenerationResult } from 'src/modules/media-generation/domain/contracts/audio-generation-result.contract';
import { EditImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/edit-image-generation-request.contract';
import { ImageVideoGenerationRequest } from 'src/modules/media-generation/domain/contracts/image-video-generation-request.contract';
import { MemeGenerationRequest } from 'src/modules/media-generation/domain/contracts/meme-generation-request.contract';
import { MemeGenerationResult } from 'src/modules/media-generation/domain/contracts/meme-generation-result.contract';
import { PromptImageGenerationResult } from 'src/modules/media-generation/domain/contracts/prompt-image-generation-result.contract';
import { ResolvedPromptImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/prompt-image-generation-request.contract';
import { TextVideoGenerationRequest } from 'src/modules/media-generation/domain/contracts/text-video-generation-request.contract';
import { VideoGenerationResult } from 'src/modules/media-generation/domain/contracts/video-generation-result.contract';
import { MediaProviderRegistryService } from 'src/modules/media-generation/infrastructure/routing/media-provider-registry.service';
import { MediaRouteResolverService } from 'src/modules/media-generation/infrastructure/routing/media-route-resolver.service';

@Injectable()
export class MediaGenerationExecutionService {
  constructor(
    private readonly mediaRouteResolverService: MediaRouteResolverService,
    private readonly mediaProviderRegistryService: MediaProviderRegistryService,
  ) {}

  async generatePromptImages(
    request: ResolvedPromptImageGenerationRequest,
  ): Promise<PromptImageGenerationResult> {
    const route = this.mediaRouteResolverService.resolvePromptImageRoute(
      request.aiService,
    );

    if (!route) {
      throw new NotImplementedException(
        `No media-generation route configured for ${request.aiService}`,
      );
    }

    const provider = this.mediaProviderRegistryService.getProvider(
      route.provider,
    );

    if (!provider.generatePromptImages) {
      throw new NotImplementedException(
        `Provider ${route.provider} does not support prompt image generation`,
      );
    }

    return await provider.generatePromptImages(request);
  }

  async editImages(
    request: EditImageGenerationRequest,
  ): Promise<PromptImageGenerationResult> {
    const route = this.mediaRouteResolverService.resolveImageEditRoute(
      request.aiService,
    );

    if (!route) {
      throw new NotImplementedException(
        `No media-generation route configured for image edit service ${request.aiService}`,
      );
    }

    const provider = this.mediaProviderRegistryService.getProvider(
      route.provider,
    );

    if (!provider.editImages) {
      throw new NotImplementedException(
        `Provider ${route.provider} does not support image editing`,
      );
    }

    return await provider.editImages(request);
  }

  async generateAudio(
    request: AudioGenerationRequest,
  ): Promise<AudioGenerationResult> {
    const route = this.mediaRouteResolverService.resolveAudioRoute(
      request.aiService,
    );

    if (!route) {
      throw new NotImplementedException(
        `No media-generation route configured for audio service ${request.aiService}`,
      );
    }

    const provider = this.mediaProviderRegistryService.getProvider(
      route.provider,
    );

    if (!provider.generateAudio) {
      throw new NotImplementedException(
        `Provider ${route.provider} does not support audio generation`,
      );
    }

    return await provider.generateAudio(request);
  }

  async generateTextVideos(
    request: TextVideoGenerationRequest,
  ): Promise<VideoGenerationResult> {
    const route = this.mediaRouteResolverService.resolveTextVideoRoute(
      request.aiService,
    );

    if (!route) {
      throw new NotImplementedException(
        `No media-generation route configured for text video service ${request.aiService}`,
      );
    }

    const provider = this.mediaProviderRegistryService.getProvider(
      route.provider,
    );

    if (!provider.generateTextVideos) {
      throw new NotImplementedException(
        `Provider ${route.provider} does not support text-to-video generation`,
      );
    }

    return await provider.generateTextVideos(request);
  }

  async generateImageVideos(
    request: ImageVideoGenerationRequest,
  ): Promise<VideoGenerationResult> {
    const route = this.mediaRouteResolverService.resolveImageVideoRoute(
      request.aiService,
    );

    if (!route) {
      throw new NotImplementedException(
        `No media-generation route configured for image video service ${request.aiService}`,
      );
    }

    const provider = this.mediaProviderRegistryService.getProvider(
      route.provider,
    );

    if (!provider.generateImageVideos) {
      throw new NotImplementedException(
        `Provider ${route.provider} does not support image-to-video generation`,
      );
    }

    return await provider.generateImageVideos(request);
  }

  async generateMemes(
    request: MemeGenerationRequest,
  ): Promise<MemeGenerationResult> {
    const route = this.mediaRouteResolverService.resolveMemeRoute(
      request.aiService,
    );

    if (!route) {
      throw new NotImplementedException(
        `No media-generation route configured for meme service ${request.aiService}`,
      );
    }

    const provider = this.mediaProviderRegistryService.getProvider(
      route.provider,
    );

    if (!provider.generateMemes) {
      throw new NotImplementedException(
        `Provider ${route.provider} does not support meme generation`,
      );
    }

    return await provider.generateMemes(request);
  }
}
