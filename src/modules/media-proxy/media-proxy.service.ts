import { Injectable, NotFoundException } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as sharp from 'sharp';
import { SpacesStorageService } from 'src/modules/uploads/spaces-storage.service';
import {
  ImageTransformation,
  MediaResourceType,
  MediaTransformation,
  derivedObjectKey,
  parseMediaPath,
  posterObjectKey,
} from './media-transformations';

const WATERMARK_PATH = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'public',
  'watermark.png',
);

/** Relative watermark sizing/position from t_yallery_download_watermarked_v1. */
const WATERMARK_RELATIVE_WIDTH = 0.18;
const WATERMARK_OPACITY = 0.8;
const WATERMARK_MARGIN = 40;

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov'];
const MAX_KNOWN_DERIVED = 10000;
const FFMPEG_TIMEOUT_MS = 180000;

export interface ResolvedMedia {
  /** CDN URL to redirect to (null when the variant must be streamed). */
  redirectUrl: string | null;
  /** Inline bytes for attachment responses. */
  body: Buffer | null;
  contentType: string | null;
  /** Content-Disposition attachment filename, when the variant is a download. */
  attachmentFilename: string | null;
  /**
   * True when the answer is deterministic forever (derived/original object
   * whose URL never changes) and may be cached aggressively. False for
   * fallback answers after a failed generation — a retry may start
   * succeeding, so caches must not pin the degraded response.
   */
  cacheable: boolean;
}

@Injectable()
export class MediaProxyService {
  /** De-duplicates concurrent generation of the same derived object. */
  private readonly inflight = new Map<string, Promise<void>>();
  /** Derived keys already confirmed to exist in the bucket. */
  private readonly knownDerived = new Set<string>();
  /** Keeps concurrent ffmpeg work bounded on the droplet. */
  private transcodeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly spacesStorage: SpacesStorageService) {}

  async resolve(
    resourceType: MediaResourceType,
    rawPath: string,
  ): Promise<ResolvedMedia> {
    const parsed = parseMediaPath(rawPath);
    if (!parsed) {
      throw new NotFoundException('Unknown media path');
    }

    let { key } = parsed;
    const transformation = parsed.transformation;

    // Legacy Cloudinary eager poster (so_0/<key>.jpg): the object never
    // existed in Spaces — regenerate the first frame from the source video.
    if (parsed.posterOfVideo && resourceType === 'video') {
      key = await this.ensurePoster(key);
      if (!transformation || transformation.kind !== 'image') {
        return this.redirectTo(key);
      }
    }

    if (!transformation) {
      return this.redirectTo(key);
    }

    if (transformation.kind === 'image') {
      return this.resolveImageVariant(
        parsed.transformationName!,
        transformation,
        key,
      );
    }

    return this.resolveVideoVariant(
      parsed.transformationName!,
      transformation,
      key,
    );
  }

  private redirectTo(key: string, cacheable = true): ResolvedMedia {
    return {
      redirectUrl: this.spacesStorage.cdnUrl(key),
      body: null,
      contentType: null,
      attachmentFilename: null,
      cacheable,
    };
  }

  private async resolveImageVariant(
    name: string,
    spec: ImageTransformation,
    key: string,
  ): Promise<ResolvedMedia> {
    // An image transformation aimed at a video object (e.g. a thumb marker
    // inserted into a videoUrl) has no image to work on — serve the original.
    if (this.isVideoKey(key)) {
      return this.redirectTo(key);
    }

    const derivedKey = derivedObjectKey(name, key);
    try {
      await this.ensureDerived(derivedKey, async () => {
        const original = await this.spacesStorage.getObjectBuffer(key);
        const transformed = await this.transformImage(original, spec, key);
        await this.spacesStorage.putPublicObject(
          derivedKey,
          transformed.body,
          transformed.contentType,
        );
      });
    } catch (error) {
      console.warn(
        `[MediaProxyService] image variant ${derivedKey} failed: ${(error as Error).message}`,
      );
      // Graceful degradation — the original is always a valid answer.
      return this.attachmentAware(spec, key, key, false);
    }
    return this.attachmentAware(spec, derivedKey, key);
  }

  private async resolveVideoVariant(
    name: string,
    spec: MediaTransformation & { kind: 'video' },
    key: string,
  ): Promise<ResolvedMedia> {
    // Passthrough download variant — original bytes, attachment headers.
    if (!spec.maxWidth) {
      return this.attachmentAware(spec, key, key);
    }
    if (!this.isVideoKey(key)) {
      return this.redirectTo(key);
    }

    const derivedKey = derivedObjectKey(name, key);
    try {
      await this.ensureDerived(derivedKey, async () => {
        const original = await this.spacesStorage.getObjectBuffer(key);
        const transcoded = await this.transcodeVideo(
          original,
          key,
          spec.maxWidth!,
        );
        await this.spacesStorage.putPublicObject(
          derivedKey,
          transcoded,
          'video/mp4',
        );
      });
    } catch (error) {
      console.warn(
        `[MediaProxyService] video variant ${derivedKey} failed: ${(error as Error).message}`,
      );
      return this.attachmentAware(spec, key, key, false);
    }
    return this.attachmentAware(spec, derivedKey, key);
  }

  /** Regenerates (once) and returns the derived key of a legacy video poster. */
  private async ensurePoster(posterKey: string): Promise<string> {
    const derivedKey = posterObjectKey(posterKey);
    await this.ensureDerived(derivedKey, async () => {
      const videoKey = await this.findSourceVideoKey(posterKey);
      if (!videoKey) {
        throw new NotFoundException(`No source video for poster ${posterKey}`);
      }
      // Serialized like transcodes — parallel poster storms (e.g. the warm-up
      // script) must not stack concurrent downloads + ffmpeg on the droplet.
      const frame = await this.enqueueTranscode(async () => {
        const video = await this.spacesStorage.getObjectBuffer(videoKey);
        return this.extractPosterFrame(video, videoKey);
      });
      await this.spacesStorage.putPublicObject(derivedKey, frame, 'image/jpeg');
    });
    return derivedKey;
  }

  /** Poster keys look like <folder>/<public_id>.jpg; the video sits at <public_id>.<video ext>. */
  private async findSourceVideoKey(posterKey: string): Promise<string | null> {
    const withoutExtension = posterKey.replace(/\.[A-Za-z0-9]+$/, '');
    for (const extension of VIDEO_EXTENSIONS) {
      const candidate = `${withoutExtension}.${extension}`;
      if (await this.spacesStorage.objectExists(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  private async ensureDerived(
    derivedKey: string,
    generate: () => Promise<void>,
  ): Promise<void> {
    if (this.knownDerived.has(derivedKey)) return;

    const pending = this.inflight.get(derivedKey);
    if (pending) return pending;

    const work = (async () => {
      if (await this.spacesStorage.objectExists(derivedKey)) {
        this.rememberDerived(derivedKey);
        return;
      }
      await generate();
      this.rememberDerived(derivedKey);
    })();

    this.inflight.set(derivedKey, work);
    try {
      await work;
    } finally {
      this.inflight.delete(derivedKey);
    }
  }

  private rememberDerived(derivedKey: string): void {
    if (this.knownDerived.size >= MAX_KNOWN_DERIVED) {
      this.knownDerived.clear();
    }
    this.knownDerived.add(derivedKey);
  }

  private async attachmentAware(
    spec: MediaTransformation,
    servedKey: string,
    originalKey: string,
    cacheable = true,
  ): Promise<ResolvedMedia> {
    if (!spec.attachment) {
      return this.redirectTo(servedKey, cacheable);
    }
    // Attachment variants must carry Content-Disposition, which the public
    // CDN cannot set — stream the bytes through the API instead.
    const body = await this.spacesStorage.getObjectBuffer(servedKey);
    return {
      redirectUrl: null,
      body,
      contentType: this.contentTypeFor(servedKey, spec),
      attachmentFilename: path.posix.basename(originalKey),
      cacheable,
    };
  }

  private contentTypeFor(key: string, spec: MediaTransformation): string {
    if (spec.kind === 'video') {
      return this.isVideoKey(key) ? 'video/mp4' : 'application/octet-stream';
    }
    const extension = this.extensionOf(key);
    const types: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
    };
    return types[extension] ?? 'application/octet-stream';
  }

  private isVideoKey(key: string): boolean {
    return VIDEO_EXTENSIONS.includes(this.extensionOf(key));
  }

  private extensionOf(key: string): string {
    return (key.split('.').pop() ?? '').toLowerCase();
  }

  private async transformImage(
    original: Buffer,
    spec: ImageTransformation,
    key: string,
  ): Promise<{ body: Buffer; contentType: string }> {
    const extension = this.extensionOf(key);
    const animated = extension === 'gif' || extension === 'webp';

    let pipeline = sharp(original, { animated });
    if (spec.fit === 'cover') {
      pipeline = pipeline.resize(spec.width, spec.height ?? spec.width, {
        fit: 'cover',
        // g_auto equivalent; animated inputs only support centre cropping.
        position: animated ? 'centre' : sharp.strategy.attention,
        withoutEnlargement: true,
      });
    } else {
      pipeline = pipeline.resize({
        width: spec.width,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    if (spec.watermark) {
      pipeline = sharp(await pipeline.toBuffer());
      pipeline = await this.applyWatermark(pipeline);
    }

    const quality = spec.quality === 'eco' ? 60 : 78;
    switch (extension) {
      case 'png':
        return {
          body: await pipeline
            .png({ palette: true, quality: Math.min(quality + 10, 90) })
            .toBuffer(),
          contentType: 'image/png',
        };
      case 'webp':
        return {
          body: await pipeline.webp({ quality }).toBuffer(),
          contentType: 'image/webp',
        };
      case 'gif':
        return {
          body: await pipeline.gif().toBuffer(),
          contentType: 'image/gif',
        };
      default:
        return {
          body: await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer(),
          contentType: 'image/jpeg',
        };
    }
  }

  /** yallery:watermark overlay — 18% of image width, 80% opacity, SE corner, 40px margins, clamped inside. */
  private async applyWatermark(pipeline: sharp.Sharp): Promise<sharp.Sharp> {
    const { width = 0, height = 0 } = await pipeline.metadata();
    if (!width || !height) return pipeline;

    const targetWidth = Math.max(
      1,
      Math.round(width * WATERMARK_RELATIVE_WIDTH),
    );
    const watermark = sharp(WATERMARK_PATH).resize({ width: targetWidth });
    const { data, info } = await watermark
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += info.channels) {
      data[i] = Math.round(data[i] * WATERMARK_OPACITY);
    }
    const watermarkBuffer = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: info.channels },
    })
      .png()
      .toBuffer();

    const left = Math.max(0, width - info.width - WATERMARK_MARGIN);
    const top = Math.max(0, height - info.height - WATERMARK_MARGIN);
    return pipeline.composite([{ input: watermarkBuffer, left, top }]);
  }

  private async transcodeVideo(
    original: Buffer,
    key: string,
    maxWidth: number,
  ): Promise<Buffer> {
    return this.enqueueTranscode(async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-proxy-'));
      const inputPath = path.join(
        tempDir,
        `in.${this.extensionOf(key) || 'mp4'}`,
      );
      const outputPath = path.join(tempDir, 'out.mp4');
      try {
        await fs.writeFile(inputPath, original);
        await this.runProcess('ffmpeg', [
          '-y',
          '-i',
          inputPath,
          '-vf',
          `scale='min(${maxWidth},iw)':-2`,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '26',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-movflags',
          '+faststart',
          outputPath,
        ]);
        return await fs.readFile(outputPath);
      } finally {
        await fs
          .rm(tempDir, { recursive: true, force: true })
          .catch(() => undefined);
      }
    });
  }

  private async extractPosterFrame(
    video: Buffer,
    videoKey: string,
  ): Promise<Buffer> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-proxy-'));
    const inputPath = path.join(
      tempDir,
      `in.${this.extensionOf(videoKey) || 'mp4'}`,
    );
    const posterPath = path.join(tempDir, 'poster.jpg');
    try {
      await fs.writeFile(inputPath, video);
      await this.runProcess('ffmpeg', [
        '-y',
        '-i',
        inputPath,
        '-frames:v',
        '1',
        '-q:v',
        '2',
        posterPath,
      ]);
      return await fs.readFile(posterPath);
    } finally {
      await fs
        .rm(tempDir, { recursive: true, force: true })
        .catch(() => undefined);
    }
  }

  /** Serializes transcodes so parallel cache misses cannot saturate the droplet CPU. */
  private enqueueTranscode<T>(work: () => Promise<T>): Promise<T> {
    const result = this.transcodeQueue.then(work, work);
    this.transcodeQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private runProcess(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { timeout: FFMPEG_TIMEOUT_MS });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => (stdout += chunk));
      child.stderr.on('data', (chunk) => (stderr += chunk));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(
            new Error(
              `${command} exited with code ${code}: ${stderr.slice(0, 500)}`,
            ),
          );
        }
      });
    });
  }
}
