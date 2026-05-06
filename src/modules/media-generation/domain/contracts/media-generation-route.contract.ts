import { MediaCapability } from 'src/modules/media-generation/domain/enums/media-capability.enum';
import { MediaDispatch } from 'src/modules/media-generation/domain/enums/media-dispatch.enum';
import { MediaProvider } from 'src/modules/media-generation/domain/enums/media-provider.enum';

export interface MediaGenerationRoute {
  capability: MediaCapability;
  provider: MediaProvider;
  dispatch: MediaDispatch;
  aiService?: string;
  queueName?: string;
  endpointId?: string;
}
