import { parentPort } from 'worker_threads';
import { v2 as cloudinary } from 'cloudinary';
import { ConfigService } from '@nestjs/config';
import * as streamifier from 'streamifier';

const configService = new ConfigService();

cloudinary.config({
  cloud_name: configService.get<string>('CLOUDINARY_CLOUD_NAME'),
  api_key: configService.get<string>('CLOUDINARY_API_KEY'),
  api_secret: configService.get<string>('CLOUDINARY_API_SECRET'),
});

parentPort?.on(
  'message',
  async (data: { buffer: Buffer; mimetype: string }) => {
    const { buffer } = data;
    try {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'octoai_images' },
        (error, result) => {
          if (error) {
            parentPort?.postMessage({ success: false, error: error.message });
          } else {
            parentPort?.postMessage({
              success: true,
              imageUrl: result.secure_url,
            });
          }
        },
      );
      streamifier.createReadStream(buffer).pipe(uploadStream);
    } catch (error) {
      parentPort?.postMessage({
        success: false,
        error: (error as Error).message,
      });
    }
  },
);
