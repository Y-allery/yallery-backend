import { MediaCapabilityDescriptor } from '../../contracts/media-capability-descriptor.contract';
import { MediaCapability } from '../../enums/media-capability.enum';

export const memeGenerateCapability: MediaCapabilityDescriptor = {
  capability: MediaCapability.MEME_GENERATE,
  mediaType: 'meme',
  description: 'Generate meme-style media using text, template, or hybrid image flows.',
};
