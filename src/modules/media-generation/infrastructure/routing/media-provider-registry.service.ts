import { Injectable } from '@nestjs/common';
import { MediaProvider } from 'src/modules/media-generation/domain/enums/media-provider.enum';
import { PrunaHostedImageMediaProvider } from 'src/modules/media-generation/infrastructure/providers/pruna/pruna-hosted-image.provider';
import { RunpodOpenEndpointMediaProvider } from 'src/modules/media-generation/infrastructure/providers/runpod/runpod-open-endpoint-media.provider';
import { MediaGenerationProvider } from 'src/modules/media-generation/domain/contracts/media-generation-provider.contract';

@Injectable()
export class MediaProviderRegistryService {
  constructor(
    private readonly runpodOpenEndpointMediaProvider: RunpodOpenEndpointMediaProvider,
    private readonly prunaHostedImageMediaProvider: PrunaHostedImageMediaProvider,
  ) {}

  getProvider(provider: MediaProvider): MediaGenerationProvider {
    switch (provider) {
      case MediaProvider.RUNPOD:
        return this.runpodOpenEndpointMediaProvider;
      case MediaProvider.PRUNA:
        return this.prunaHostedImageMediaProvider;
      default:
        throw new Error(`Unsupported media provider: ${provider}`);
    }
  }
}
