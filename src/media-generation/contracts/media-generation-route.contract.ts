import { MediaCapability } from '../enums/media-capability.enum';
import { MediaDispatch } from '../enums/media-dispatch.enum';
import { MediaProvider } from '../enums/media-provider.enum';

export interface MediaGenerationRoute {
  capability: MediaCapability;
  provider: MediaProvider;
  dispatch: MediaDispatch;
  aiService?: string;
  apiModel?: string;
  queueName?: string;
  endpointId?: string;
  endpointVersion?: string;
}
