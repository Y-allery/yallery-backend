import { Injectable } from '@nestjs/common';
import { UploadService } from 'src/upload/upload.service';
import { RunpodGeneratedImageAsset } from '../providers/runpod/runpod.types';
import { RunpodImageProvider } from '../providers/runpod/runpod-image.provider';
import { GenerateMediaImageDto } from './dto/generate-media-image.dto';
import {
  MEDIA_IMAGE_DEFAULT_NEGATIVE_PROMPT,
  MEDIA_IMAGE_DEFAULT_ORIENTATION,
  MEDIA_IMAGE_DIMENSIONS,
} from './media-image.constants';

@Injectable()
export class MediaImageGenerationService {
  constructor(
    private readonly runpodImageProvider: RunpodImageProvider,
    private readonly uploadService: UploadService,
  ) {}

  async generate(dto: GenerateMediaImageDto): Promise<{
    images: string[];
    jobId: string;
    providerModel: string;
  }> {
    const orientation = dto.orientation ?? MEDIA_IMAGE_DEFAULT_ORIENTATION;
    const imageQuantity = dto.imageQuantity ?? 1;
    const { width, height } = MEDIA_IMAGE_DIMENSIONS[orientation];

    const result = await this.runpodImageProvider.generate({
      prompt: dto.prompt,
      negativePrompt: dto.negativePrompt || MEDIA_IMAGE_DEFAULT_NEGATIVE_PROMPT,
      width,
      height,
      imageQuantity,
    });

    const images = await Promise.all(
      result.assets.map((asset) => this.uploadAsset(asset)),
    );

    return {
      images,
      jobId: result.jobId,
      providerModel: result.providerModel,
    };
  }

  private async uploadAsset(asset: RunpodGeneratedImageAsset): Promise<string> {
    if (asset.kind === 'url' && asset.url) {
      return this.uploadService.uploadByUrl(asset.url);
    }

    if (asset.kind === 'base64' && asset.base64) {
      const buffer = Buffer.from(asset.base64, 'base64');
      return this.uploadService.uploadByBuffer(
        buffer,
        asset.mimeType || 'image/png',
      );
    }

    throw new Error(`Unsupported RunPod asset: ${JSON.stringify(asset)}`);
  }
}
