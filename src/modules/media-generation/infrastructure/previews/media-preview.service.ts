import { Injectable } from '@nestjs/common';

@Injectable()
export class MediaPreviewService {
  generateCloudinaryVideoPreviewUrl(videoUrl: string): string | null {
    try {
      if (!videoUrl || typeof videoUrl !== 'string') {
        return null;
      }

      const base = videoUrl.split('?')[0];

      if (base.includes('/video/upload/')) {
        const withFrame = base.replace('/video/upload/', '/video/upload/so_0/');
        if (/\.(mp4|webm|mov|avi)$/i.test(withFrame)) {
          return withFrame.replace(/\.(mp4|webm|mov|avi)$/i, '.jpg');
        }

        return `${withFrame}.jpg`;
      }

      if (/\.(mp4|webm|mov|avi)$/i.test(base)) {
        return base.replace(/\.(mp4|webm|mov|avi)$/i, '.jpg');
      }

      return `${base}.jpg`;
    } catch {
      return null;
    }
  }
}
