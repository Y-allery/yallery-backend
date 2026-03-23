import { Injectable } from '@nestjs/common';
import { MediaGenerationContextService } from '../shared/media-generation-context.service';
import { GenerateMediaImageDto } from './dto/generate-media-image.dto';
import {
  MEDIA_IMAGE_DEFAULT_NEGATIVE_PROMPT,
  MEDIA_IMAGE_DEFAULT_ORIENTATION,
} from './media-image.constants';
import { MediaImageProfileResolverService } from './media-image-profile-resolver.service';
import { MediaImagePromptComposerService } from './media-image-prompt-composer.service';
import { MediaImageGenerationRequest } from './types/media-image-request.types';

@Injectable()
export class MediaImageRequestBuilderService {
  constructor(
    private readonly mediaGenerationContextService: MediaGenerationContextService,
    private readonly mediaImagePromptComposerService: MediaImagePromptComposerService,
    private readonly mediaImageProfileResolverService: MediaImageProfileResolverService,
  ) {}

  async build(dto: GenerateMediaImageDto): Promise<MediaImageGenerationRequest> {
    const context = await this.mediaGenerationContextService.resolve({
      context: dto.context,
      tagId: dto.tagId,
      styleId: dto.styleId,
      colorId: dto.colorId,
      contestId: dto.contestId,
    });

    const profile = this.mediaImageProfileResolverService.resolve(
      dto.orientation ?? MEDIA_IMAGE_DEFAULT_ORIENTATION,
    );

    return {
      prompt: this.mediaImagePromptComposerService.compose(dto.prompt, context),
      negativePrompt:
        dto.negativePrompt?.trim() || MEDIA_IMAGE_DEFAULT_NEGATIVE_PROMPT,
      width: profile.width,
      height: profile.height,
      imageQuantity: dto.imageQuantity ?? 1,
      profileKey: profile.key,
      providerModel: profile.providerModel,
      context,
    };
  }
}
