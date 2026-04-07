import { MediaCapability } from '../enums/media-capability.enum';

export interface MediaCapabilityDescriptor {
  capability: MediaCapability;
  mediaType: 'image' | 'audio' | 'video' | 'meme';
  description: string;
}
