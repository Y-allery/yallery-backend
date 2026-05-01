import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import * as path from 'path';
import { Worker } from 'worker_threads';

export interface UploadedVideoAsset {
  videoUrl: string;
  previewImageUrl: string | null;
}

@Injectable()
export class UploadService {
  constructor(private readonly configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.get('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadByBuffer(
    buffer: Buffer,
    mimetype: string = 'image/jpeg',
  ): Promise<string> {
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

  createSignedImageUploadParams(
    folder = 'octoai_images',
  ): {
    cloudName: string;
    apiKey: string;
    folder: string;
    timestamp: number;
    signature: string;
  } {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error('Cloudinary configuration is missing');
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = { folder, timestamp };
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      apiSecret,
    );

    return {
      cloudName,
      apiKey,
      folder,
      timestamp,
      signature,
    };
  }

  async uploadVideoAssetByUrl(videoUrl: string): Promise<UploadedVideoAsset> {
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
            if (!previewImageUrl) {
              console.warn(
                `[UploadService] Cloudinary video upload did not return eager preview for ${result?.public_id ?? videoUrl}`,
              );
            }

            resolve({
              videoUrl: result.secure_url,
              previewImageUrl,
            });
          }
        },
      );
    });
  }

  async uploadVideoByUrl(videoUrl: string): Promise<string> {
    const asset = await this.uploadVideoAssetByUrl(videoUrl);
    return asset.videoUrl;
  }

  async uploadByUrl(imageUrl: string): Promise<string> {
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
