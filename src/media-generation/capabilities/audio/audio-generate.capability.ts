import { MediaCapabilityDescriptor } from '../../contracts/media-capability-descriptor.contract';
import { MediaCapability } from '../../enums/media-capability.enum';

export const audioGenerateCapability: MediaCapabilityDescriptor = {
  capability: MediaCapability.AUDIO_GENERATE,
  mediaType: 'audio',
  description: 'Generate audio output such as songs, voice, or sound-driven media.',
};
