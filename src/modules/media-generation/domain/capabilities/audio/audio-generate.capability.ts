import { MediaCapabilityDescriptor } from 'src/modules/media-generation/api/contracts/media-capability-descriptor.contract';
import { MediaCapability } from 'src/modules/media-generation/domain/enums/media-capability.enum';

export const audioGenerateCapability: MediaCapabilityDescriptor = {
  capability: MediaCapability.AUDIO_GENERATE,
  mediaType: 'audio',
  description: 'Generate audio output such as songs, voice, or sound-driven media.',
};
