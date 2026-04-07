import { MediaCapabilityDescriptor } from '../../contracts/media-capability-descriptor.contract';
import { MediaCapability } from '../../enums/media-capability.enum';

export const imageEditCapability: MediaCapabilityDescriptor = {
  capability: MediaCapability.IMAGE_EDIT,
  mediaType: 'image',
  description: 'Edit an existing image with provider-specific edit models or endpoints.',
};
