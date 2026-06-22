import { BadGatewayException, Injectable } from '@nestjs/common';

@Injectable()
export class RunpodOutputExtractor {
  extractImageSources(output: unknown): string[] {
    const candidates: string[] = [];

    const collect = (value: unknown) => {
      if (!value) {
        return;
      }

      if (typeof value === 'string') {
        if (this.isSupportedImageSource(value)) {
          candidates.push(value);
        }
        return;
      }

      if (Array.isArray(value)) {
        value.forEach(collect);
        return;
      }

      if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        collect(record.image_url);
        collect(record.imageUrl);
        collect(record.data_uri);
        collect(record.url);
        collect(record.result);
        collect(record.images);
        collect(record.output);
        collect(record.data);

        if (
          typeof record.base64 === 'string' &&
          typeof record.format === 'string'
        ) {
          const format = record.format === 'jpg' ? 'jpeg' : record.format;
          collect(`data:image/${format};base64,${record.base64}`);
        }
      }
    };

    collect(output);

    const uniqueUrls = [...new Set(candidates)];

    if (uniqueUrls.length === 0) {
      throw new BadGatewayException(
        `RunPod response did not include image URLs: ${JSON.stringify(output)}`,
      );
    }

    return uniqueUrls;
  }

  hasExtractableImageSource(output: unknown): boolean {
    try {
      return this.extractImageSources(output).length > 0;
    } catch {
      return false;
    }
  }

  extractVideoSource(output: unknown): string {
    const candidates: string[] = [];

    const collect = (value: unknown) => {
      if (!value) {
        return;
      }

      if (typeof value === 'string') {
        if (this.isSupportedVideoSource(value)) {
          candidates.push(value);
        }
        return;
      }

      if (Array.isArray(value)) {
        value.forEach(collect);
        return;
      }

      if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        collect(record.video);
        collect(record.video_url);
        collect(record.videoUrl);
        collect(record.videos);
        collect(record.url);
        collect(record.result);
        collect(record.output);
        collect(record.data);

        // LTX worker returns the finished clip as a bare base64 mp4 under `video_b64`.
        if (typeof record.video_b64 === 'string') {
          collect(`data:video/mp4;base64,${record.video_b64}`);
        }

        if (typeof record.base64 === 'string') {
          const format =
            typeof record.format === 'string' &&
            record.format.startsWith('video/')
              ? record.format
              : 'video/mp4';
          collect(`data:${format};base64,${record.base64}`);
        }
      }
    };

    collect(output);

    const [firstVideo] = [...new Set(candidates)];

    if (!firstVideo) {
      throw new BadGatewayException(
        `RunPod response did not include video URLs: ${JSON.stringify(output)}`,
      );
    }

    return firstVideo;
  }

  hasExtractableVideoSource(output: unknown): boolean {
    try {
      return Boolean(this.extractVideoSource(output));
    } catch {
      return false;
    }
  }

  private isSupportedImageSource(value: string): boolean {
    return value.startsWith('http') || value.startsWith('data:image/');
  }

  private isSupportedVideoSource(value: string): boolean {
    return value.startsWith('http') || value.startsWith('data:video/');
  }
}
