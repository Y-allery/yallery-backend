import { Injectable } from '@nestjs/common';
import { MediaProvider } from '../enums/media-provider.enum';
import { InternalMediaProvider } from '../providers/internal/internal-media.provider';
import { RunpodOpenEndpointMediaProvider } from '../providers/runpod/runpod-open-endpoint-media.provider';
import { XRouterMediaProvider } from '../providers/x-router/x-router-media.provider';
import { MediaGenerationProvider } from '../contracts/media-generation-provider.contract';

@Injectable()
export class MediaProviderRegistryService {
  constructor(
    private readonly runpodOpenEndpointMediaProvider: RunpodOpenEndpointMediaProvider,
    private readonly xRouterMediaProvider: XRouterMediaProvider,
    private readonly internalMediaProvider: InternalMediaProvider,
  ) {}

  getProvider(provider: MediaProvider): MediaGenerationProvider {
    switch (provider) {
      case MediaProvider.RUNPOD:
        return this.runpodOpenEndpointMediaProvider;
      case MediaProvider.X_ROUTER:
        return this.xRouterMediaProvider;
      case MediaProvider.INTERNAL:
        return this.internalMediaProvider;
      default:
        throw new Error(`Unsupported media provider: ${provider}`);
    }
  }
}
