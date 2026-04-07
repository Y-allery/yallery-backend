import { MediaCapabilityDescriptor } from '../../contracts/media-capability-descriptor.contract';
import { MediaCapability } from '../../enums/media-capability.enum';

export const videoGenerateCapability: MediaCapabilityDescriptor = {
  capability: MediaCapability.VIDEO_GENERATE,
  mediaType: 'video',
  description: 'Generate or render a video asset from prompts or other source media.',
};
