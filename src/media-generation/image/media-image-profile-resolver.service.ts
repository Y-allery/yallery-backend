import { Injectable } from '@nestjs/common';
import { RunpodConfigService } from '../providers/runpod/runpod.config.service';
import {
  MEDIA_IMAGE_DEFAULT_DIMENSIONS,
  MEDIA_IMAGE_DEFAULT_ORIENTATION,
  MEDIA_IMAGE_MODEL_PROFILES,
  MediaImageDimensions,
  MediaImageOrientation,
} from './media-image.constants';

interface MediaImageResolvedProfile {
  key: string;
  providerModel: string;
  width: number;
  height: number;
}

@Injectable()
export class MediaImageProfileResolverService {
  constructor(
    private readonly runpodConfigService: RunpodConfigService,
  ) {}

  resolve(
    orientation: MediaImageOrientation = MEDIA_IMAGE_DEFAULT_ORIENTATION,
  ): MediaImageResolvedProfile {
    const configuredModel = this.runpodConfigService.getImageModel() || 'default';
    const normalizedModel = configuredModel.toLowerCase();
    const matchedProfile = MEDIA_IMAGE_MODEL_PROFILES.find((profile) =>
      profile.modelMatchers.some((matcher) =>
        normalizedModel.includes(matcher.toLowerCase()),
      ),
    );

    const dimensions = this.readDimensions(matchedProfile?.dimensions, orientation);

    return {
      key: matchedProfile?.key || 'default',
      providerModel: configuredModel,
      width: dimensions.width,
      height: dimensions.height,
    };
  }

  private readDimensions(
    dimensions: Record<MediaImageOrientation, MediaImageDimensions> | undefined,
    orientation: MediaImageOrientation,
  ): MediaImageDimensions {
    return dimensions?.[orientation] || MEDIA_IMAGE_DEFAULT_DIMENSIONS[orientation];
  }
}
