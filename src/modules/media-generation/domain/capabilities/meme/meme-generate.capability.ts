import { MediaCapabilityDescriptor } from 'src/modules/media-generation/api/contracts/media-capability-descriptor.contract';
import { MediaCapability } from 'src/modules/media-generation/domain/enums/media-capability.enum';

export const memeGenerateCapability: MediaCapabilityDescriptor = {
  capability: MediaCapability.MEME_GENERATE,
  mediaType: 'meme',
  description:
    'Generate meme-style media using text, template, or hybrid image flows.',
};
