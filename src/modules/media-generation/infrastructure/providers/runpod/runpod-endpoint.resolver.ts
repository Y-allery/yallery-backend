import { Injectable } from '@nestjs/common';
import { AudioGenerationRequest } from 'src/modules/media-generation/domain/contracts/audio-generation-request.contract';
import { EditImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/edit-image-generation-request.contract';
import { ImageVideoGenerationRequest } from 'src/modules/media-generation/domain/contracts/image-video-generation-request.contract';
import { MemeGenerationRequest } from 'src/modules/media-generation/domain/contracts/meme-generation-request.contract';
import { ResolvedPromptImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/prompt-image-generation-request.contract';
import { TextVideoGenerationRequest } from 'src/modules/media-generation/domain/contracts/text-video-generation-request.contract';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';
import {
  getRunpodMediaRoute,
  MediaRouteType,
} from 'src/modules/media-generation/infrastructure/routing/media-route.catalog';

@Injectable()
export class RunpodEndpointResolver {
  constructor(
    private readonly providerRuntimeConfigService: ProviderRuntimeConfigService,
  ) {}

  async getEndpointIdForPromptImageRequest(
    request: ResolvedPromptImageGenerationRequest,
  ): Promise<string> {
    return this.getRequiredEndpointId(request.aiService, 'promptImage');
  }

  async getEndpointIdForImageEditRequest(
    request: EditImageGenerationRequest,
  ): Promise<string> {
    return this.getRequiredEndpointId(request.aiService, 'imageEdit');
  }

  async getEndpointIdForAudioRequest(
    request: AudioGenerationRequest,
  ): Promise<string> {
    return this.getRequiredEndpointId(request.aiService, 'audio');
  }

  async getEndpointIdForTextVideoRequest(
    request: TextVideoGenerationRequest,
  ): Promise<string> {
    return this.getRequiredEndpointId(request.aiService, 'textVideo');
  }

  async getEndpointIdForImageVideoRequest(
    request: ImageVideoGenerationRequest,
  ): Promise<string> {
    return this.getRequiredEndpointId(request.aiService, 'imageVideo');
  }

  async getEndpointIdForMemeRequest(
    request: MemeGenerationRequest,
  ): Promise<string> {
    return this.getRequiredEndpointId(request.aiService, 'meme');
  }

  private async getRequiredEndpointId(
    aiService: string,
    routeType: MediaRouteType,
  ): Promise<string> {
    const route = getRunpodMediaRoute(aiService, routeType);

    if (!route) {
      throw new Error(
        `RunPod ${routeType} endpoint is not configured for ${aiService}`,
      );
    }

    const value = await this.providerRuntimeConfigService.getString(
      route.endpointConfigKey,
    );

    if (!value) {
      throw new Error(`${route.endpointConfigKey} is not configured`);
    }

    return value;
  }
}
