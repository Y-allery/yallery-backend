import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import * as path from 'path';
import { Worker } from 'worker_threads';

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

      worker.postMessage({ buffer, mimetype });

      worker.on('message', (message) => {
        if (message.success) {
          resolve(message.imageUrl);
        } else {
          reject(new Error(message.error));
        }
      });

      worker.on('error', (error) => {
        reject(error);
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
    });
  }

  async uploadVideoByUrl(videoUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
        videoUrl,
        {
          resource_type: 'video',
          folder: 'octoai_videos',
        },
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
