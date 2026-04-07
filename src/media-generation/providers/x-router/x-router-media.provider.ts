import { Injectable } from '@nestjs/common';
import { MediaGenerationProvider } from '../../contracts/media-generation-provider.contract';
import { MediaCapability } from '../../enums/media-capability.enum';
import { MediaProvider } from '../../enums/media-provider.enum';

@Injectable()
export class XRouterMediaProvider implements MediaGenerationProvider {
  readonly provider = MediaProvider.X_ROUTER;

  readonly capabilities = [
    MediaCapability.IMAGE_GENERATE,
    MediaCapability.IMAGE_EDIT,
  ];
}
