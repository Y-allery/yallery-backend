import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import * as path from 'path';
import { Worker } from 'worker_threads';
import { SpacesStorageService } from './spaces-storage.service';
import { UploadedVideoAsset } from './upload.types';

export { UploadedVideoAsset } from './upload.types';

type MediaStorageDriver = 'cloudinary' | 'spaces';

@Injectable()
export class UploadService {
  constructor(
    private readonly configService: ConfigService,
    private readonly spacesStorage: SpacesStorageService,
  ) {
    cloudinary.config({
      cloud_name: this.configService.get('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get('CLOUDINARY_API_SECRET'),
    });
  }

  /**
   * Generated-media storage backend. Defaults to cloudinary so the switch to
   * Spaces is an .env flip (MEDIA_STORAGE_DRIVER=spaces) with instant rollback.
   */
  private getStorageDriver(): MediaStorageDriver {
    const driver = this.configService.get<string>('MEDIA_STORAGE_DRIVER');
    return driver === 'spaces' && this.spacesStorage.isConfigured()
      ? 'spaces'
      : 'cloudinary';
  }

  async uploadByBuffer(
    buffer: Buffer,
    mimetype: string = 'image/jpeg',
  ): Promise<string> {
    if (this.getStorageDriver() === 'spaces') {
      return this.spacesStorage.uploadBuffer(buffer, mimetype);
    }
    return new Promise((resolve, reject) => {
      const workerPath = path.resolve(__dirname, 'image-worker.js');
      const worker = new Worker(workerPath);
      let settled = false;

      const finish = (cb: (value: any) => void, value: any) => {
        if (settled) return;
        settled = true;
        worker.removeAllListeners('message');
        worker.removeAllListeners('error');
        worker.removeAllListeners('exit');
        cb(value);
      };

      // Передаємо конфігурацію Cloudinary з основного процесу
      const cloudinaryConfig = {
        cloud_name: this.configService.get('CLOUDINARY_CLOUD_NAME'),
        api_key: this.configService.get('CLOUDINARY_API_KEY'),
        api_secret: this.configService.get('CLOUDINARY_API_SECRET'),
      };

      worker.postMessage({ buffer, mimetype, cloudinaryConfig });

      worker.on('message', (message) => {
        if (message.success) {
          finish(resolve, message.imageUrl);
        } else {
          finish(reject, new Error(message.error));
        }
        worker.terminate().catch(() => undefined);
      });

      worker.on('error', (error) => {
        finish(reject, error);
      });

      worker.on('exit', (code) => {
        if (!settled && code !== 0) {
          finish(reject, new Error(`Worker stopped with exit code ${code}`));
        }
      });
    });
  }

  /**
   * Admin browser uploads (meme reference videos). Always stored to Spaces —
   * the point of the endpoint is to stop minting new Cloudinary URLs — so it
   * ignores MEDIA_STORAGE_DRIVER and fails when Spaces is unconfigured.
   */
  async uploadVideoByBuffer(
    buffer: Buffer,
    mimetype: string,
    originalName?: string,
  ): Promise<string> {
    if (!this.spacesStorage.isConfigured()) {
      throw new Error(
        'Spaces storage is not configured (SPACES_REGION/BUCKET/ACCESS_KEY/SECRET_KEY)',
      );
    }
    return this.spacesStorage.uploadVideoBuffer(buffer, mimetype, originalName);
  }

  async uploadVideoAssetByUrl(videoUrl: string): Promise<UploadedVideoAsset> {
    if (this.getStorageDriver() === 'spaces') {
      return this.spacesStorage.uploadVideoAssetFromSource(videoUrl);
    }
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
        videoUrl,
        {
          resource_type: 'video',
          folder: 'octoai_videos',
          eager_async: false,
          eager: [
            {
              start_offset: '0',
              format: 'jpg',
            },
          ],
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else if (!result?.secure_url) {
            reject(new Error('Cloudinary video upload did not return secure_url'));
          } else {
            const previewImageUrl = result?.eager?.[0]?.secure_url ?? null;
            const width = this.toFiniteNumberOrNull(result?.width);
            const height = this.toFiniteNumberOrNull(result?.height);
            const hasAudio = this.resolveHasAudio(result);
            if (!previewImageUrl) {
              console.warn(
                `[UploadService] Cloudinary video upload did not return eager preview for ${result?.public_id ?? videoUrl}`,
              );
            }
            if (!width || !height) {
              console.warn(
                `[UploadService] Cloudinary video upload did not return dimensions for ${result?.public_id ?? videoUrl}`,
              );
            }

            resolve({
              videoUrl: result.secure_url,
              previewImageUrl,
              width,
              height,
              hasAudio,
            });
          }
        },
      );
    });
  }

  private resolveHasAudio(result: Record<string, any>): boolean | null {
    const directAudio = result.audio;
    if (typeof directAudio === 'boolean') {
      return directAudio;
    }
    if (directAudio && typeof directAudio === 'object') {
      return Object.values(directAudio).some((value) => Boolean(value));
    }

    const audioCodec =
      result.audio_codec ??
      result.audioCodec ??
      result.audio?.codec ??
      result.media_metadata?.audio_codec ??
      result.metadata?.audio_codec;

    if (typeof audioCodec === 'string') {
      const normalizedCodec = audioCodec.trim().toLowerCase();
      if (!normalizedCodec || normalizedCodec === 'none') {
        return false;
      }
      return true;
    }

    return null;
  }

  private toFiniteNumberOrNull(value: unknown): number | null {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0
      ? numericValue
      : null;
  }

  async uploadByUrl(imageUrl: string): Promise<string> {
    if (this.getStorageDriver() === 'spaces') {
      return this.spacesStorage.uploadImageFromSource(imageUrl);
    }
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
        imageUrl,
        { folder: 'octoai_images' },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result.secure_url);
          }
        },
      );
    });
  }
}
