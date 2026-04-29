import { MediaCapability } from 'src/modules/media-generation/domain/enums/media-capability.enum';

export interface MediaCapabilityDescriptor {
  capability: MediaCapability;
  mediaType: 'image' | 'audio' | 'video' | 'meme';
  description: string;
}
