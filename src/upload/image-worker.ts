import { parentPort } from 'worker_threads';
import { v2 as cloudinary } from 'cloudinary';
import * as streamifier from 'streamifier';

parentPort?.on(
  'message',
  async (data: { 
    buffer: Buffer; 
    mimetype: string; 
    cloudinaryConfig: { 
      cloud_name: string; 
      api_key: string; 
      api_secret: string;
    };
  }) => {
    const { buffer, mimetype, cloudinaryConfig } = data;
    
    // Перевіряємо конфігурацію
    if (!cloudinaryConfig || !cloudinaryConfig.cloud_name) {
      parentPort?.postMessage({
        success: false,
        error: 'Cloudinary configuration is missing or invalid',
      });
      return;
    }

    try {
      // Налаштовуємо Cloudinary з переданої конфігурації
      cloudinary.config({
        cloud_name: cloudinaryConfig.cloud_name,
        api_key: cloudinaryConfig.api_key,
        api_secret: cloudinaryConfig.api_secret,
      });

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'octoai_images',
          resource_type: mimetype?.startsWith('video/') ? 'video' : 'auto',
        },
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
