import { MediaCapabilityDescriptor } from 'src/modules/media-generation/api/contracts/media-capability-descriptor.contract';
import { MediaCapability } from 'src/modules/media-generation/domain/enums/media-capability.enum';

export const imageEditCapability: MediaCapabilityDescriptor = {
  capability: MediaCapability.IMAGE_EDIT,
  mediaType: 'image',
  description:
    'Edit an existing image with provider-specific edit models or endpoints.',
};
