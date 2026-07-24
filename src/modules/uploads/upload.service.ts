import { Injectable } from '@nestjs/common';
import { SpacesStorageService } from './spaces-storage.service';
import { StagedPrivateVideoAsset, UploadedVideoAsset } from './upload.types';

export { UploadedVideoAsset } from './upload.types';

@Injectable()
export class UploadService {
  constructor(private readonly spacesStorage: SpacesStorageService) {}

  private assertSpacesConfigured(): void {
    if (!this.spacesStorage.isConfigured()) {
      throw new Error(
        'Spaces storage is not configured (SPACES_REGION/BUCKET/ACCESS_KEY/SECRET_KEY)',
      );
    }
  }

  async uploadByBuffer(
    buffer: Buffer,
    mimetype: string = 'image/jpeg',
  ): Promise<string> {
    this.assertSpacesConfigured();
    return this.spacesStorage.uploadBuffer(buffer, mimetype);
  }

  /** Admin browser uploads (meme reference videos). */
  async uploadVideoByBuffer(
    buffer: Buffer,
    mimetype: string,
    originalName?: string,
  ): Promise<string> {
    this.assertSpacesConfigured();
    return this.spacesStorage.uploadVideoBuffer(buffer, mimetype, originalName);
  }

  async uploadVideoAssetByUrl(videoUrl: string): Promise<UploadedVideoAsset> {
    this.assertSpacesConfigured();
    return this.spacesStorage.uploadVideoAssetFromSource(videoUrl);
  }

  async uploadVideoAssetByUrlOnce(
    videoUrl: string,
    idempotencyKey: string,
  ): Promise<UploadedVideoAsset> {
    this.assertSpacesConfigured();
    return this.spacesStorage.uploadVideoAssetFromSourceOnce(
      videoUrl,
      idempotencyKey,
    );
  }

  async stagePrivateVideoByDataOnce(
    videoData: string,
    idempotencyKey: string,
  ): Promise<StagedPrivateVideoAsset> {
    this.assertSpacesConfigured();
    return this.spacesStorage.stagePrivateVideoFromDataOnce(
      videoData,
      idempotencyKey,
    );
  }

  async loadStagedPrivateVideo(
    privateArtifactRef: string,
    expectedSha256: string,
  ): Promise<StagedPrivateVideoAsset> {
    this.assertSpacesConfigured();
    return this.spacesStorage.loadStagedPrivateVideo(
      privateArtifactRef,
      expectedSha256,
    );
  }

  async loadStagedPrivateVideoBytes(
    privateArtifactRef: string,
    expectedSha256: string,
  ): Promise<Buffer> {
    this.assertSpacesConfigured();
    return this.spacesStorage.loadStagedPrivateVideoBytes(
      privateArtifactRef,
      expectedSha256,
    );
  }

  async publishStagedVideoOnce(
    privateArtifactRef: string,
    expectedSha256: string,
    idempotencyKey: string,
  ): Promise<UploadedVideoAsset> {
    this.assertSpacesConfigured();
    return this.spacesStorage.publishStagedVideoOnce(
      privateArtifactRef,
      expectedSha256,
      idempotencyKey,
    );
  }

  async deleteStagedPrivateVideo(privateArtifactRef: string): Promise<void> {
    this.assertSpacesConfigured();
    await this.spacesStorage.deleteStagedPrivateVideo(privateArtifactRef);
  }

  async uploadByUrl(imageUrl: string): Promise<string> {
    this.assertSpacesConfigured();
    return this.spacesStorage.uploadImageFromSource(imageUrl);
  }
}
