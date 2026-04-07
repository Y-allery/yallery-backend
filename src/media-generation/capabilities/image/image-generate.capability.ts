import { MediaCapabilityDescriptor } from '../../contracts/media-capability-descriptor.contract';
import { MediaCapability } from '../../enums/media-capability.enum';

export const imageGenerateCapability: MediaCapabilityDescriptor = {
  capability: MediaCapability.IMAGE_GENERATE,
  mediaType: 'image',
  description: 'Generate a new image from prompt-driven input.',
};
