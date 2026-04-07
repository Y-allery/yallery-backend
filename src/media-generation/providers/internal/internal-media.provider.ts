import { Injectable } from '@nestjs/common';
import { MediaGenerationProvider } from '../../contracts/media-generation-provider.contract';
import { MediaCapability } from '../../enums/media-capability.enum';
import { MediaProvider } from '../../enums/media-provider.enum';

@Injectable()
export class InternalMediaProvider implements MediaGenerationProvider {
  readonly provider = MediaProvider.INTERNAL;

  readonly capabilities = [
    MediaCapability.IMAGE_GENERATE,
    MediaCapability.IMAGE_EDIT,
    MediaCapability.AUDIO_GENERATE,
    MediaCapability.VIDEO_GENERATE,
    MediaCapability.MEME_GENERATE,
  ];
}
