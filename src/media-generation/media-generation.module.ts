import { Module } from '@nestjs/common';
import { UploadModule } from 'src/upload/upload.module';
import { MediaImageGenerationController } from './image/media-image-generation.controller';
import { MediaImageGenerationService } from './image/media-image-generation.service';
import { PublicMediaImageGenerationController } from './image/public-media-image-generation.controller';
import { RunpodProviderModule } from './providers/runpod/runpod-provider.module';

@Module({
  imports: [UploadModule, RunpodProviderModule],
  controllers: [
    MediaImageGenerationController,
    PublicMediaImageGenerationController,
  ],
  providers: [MediaImageGenerationService],
  exports: [MediaImageGenerationService],
})
export class MediaGenerationModule {}
