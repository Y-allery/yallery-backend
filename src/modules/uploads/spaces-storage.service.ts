import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import axios from 'axios';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { UploadedVideoAsset } from './upload.types';

const IMAGE_FOLDER = 'octoai_images';
const VIDEO_FOLDER = 'octoai_videos';
const CACHE_CONTROL = 'public, max-age=31536000, immutable';
/**
 * Cap on whole-object downloads into memory (MEDIA_MAX_OBJECT_BYTES
 * overrides). 300MB leaves headroom for legit ~100MB videos while keeping a
 * single hostile request from OOMing the droplet.
 */
const DEFAULT_MAX_OBJECT_BYTES = 314572800;
/** Media-proxy reads: a request is already waiting on these. */
const OBJECT_FETCH_TIMEOUT_MS = 120000;
/**
 * Worker reads of provider output. Deliberately far higher than the proxy's:
 * this path had no timeout at all and routinely pulls large videos off RunPod,
 * so a proxy-sized budget here would fail generations that used to succeed.
 * It exists only to stop a hung download from pinning a worker forever.
 */
const WORKER_FETCH_TIMEOUT_MS = 600000;

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

const VIDEO_MIME_BY_EXTENSION: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

interface FetchedMedia {
  buffer: Buffer;
  contentType: string;
}

export interface ObjectStream {
  stream: Readable;
  /** Size in bytes when the storage layer reports it. */
  contentLength: number | null;
  contentType: string | null;
}

/** Thrown when a download exceeds the byte cap — callers map it to an HTTP 413 instead of a 500. */
export class ObjectTooLargeError extends Error {
  constructor(source: string, limitBytes: number) {
    super(`Object ${source} exceeds the ${limitBytes}-byte download limit`);
    this.name = 'ObjectTooLargeError';
  }
}

@Injectable()
export class SpacesStorageService {
  private client: S3Client | null = null;

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.configService.get<string>('SPACES_REGION') &&
        this.configService.get<string>('SPACES_BUCKET') &&
        this.configService.get<string>('SPACES_ACCESS_KEY') &&
        this.configService.get<string>('SPACES_SECRET_KEY'),
    );
  }

  async uploadBuffer(
    buffer: Buffer,
    contentType: string,
    folder: string = IMAGE_FOLDER,
  ): Promise<string> {
    const extension = EXTENSION_BY_MIME[contentType] ?? 'bin';
    const key = `${folder}/${randomUUID()}.${extension}`;
    await this.putObject(key, buffer, contentType);
    if (contentType.startsWith('image/')) {
      this.warmImageVariants(key);
    }
    return this.publicMediaUrl(key, 'image');
  }

  async uploadImageFromSource(source: string): Promise<string> {
    const media = await this.fetchMedia(source, 'image/jpeg');
    return this.uploadBuffer(media.buffer, media.contentType, IMAGE_FOLDER);
  }

  /**
   * Stores a browser-uploaded video as-is (no preview/probe — the media proxy
   * derives posters on demand via so_0). Falls back to the original filename's
   * extension because browsers report some .mov/.mp4 files as octet-stream.
   */
  async uploadVideoBuffer(
    buffer: Buffer,
    contentType: string,
    originalName?: string,
  ): Promise<string> {
    const isVideoMime = Boolean(contentType?.startsWith('video/'));
    const extensionFromName = originalName
      ?.match(/\.([a-z0-9]{2,5})$/i)?.[1]
      ?.toLowerCase();
    const extension =
      (isVideoMime ? EXTENSION_BY_MIME[contentType] : undefined) ??
      (extensionFromName && VIDEO_MIME_BY_EXTENSION[extensionFromName]
        ? extensionFromName
        : 'mp4');
    const effectiveContentType = isVideoMime
      ? contentType
      : VIDEO_MIME_BY_EXTENSION[extension];
    const key = `${VIDEO_FOLDER}/${randomUUID()}.${extension}`;
    await this.putObject(key, buffer, effectiveContentType);
    return this.publicMediaUrl(key, 'video');
  }

  async uploadVideoAssetFromSource(
    source: string,
  ): Promise<UploadedVideoAsset> {
    const media = await this.fetchMedia(source, 'video/mp4');
    const contentType = media.contentType.startsWith('video/')
      ? media.contentType
      : 'video/mp4';
    const extension = EXTENSION_BY_MIME[contentType] ?? 'mp4';

    const assetId = randomUUID();
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-upload-'));
    const videoPath = path.join(tempDir, `source.${extension}`);
    const previewPath = path.join(tempDir, 'preview.jpg');

    try {
      await fs.writeFile(videoPath, media.buffer);

      const metadata = await this.probeVideo(videoPath);
      const previewBuffer = await this.extractPreviewFrame(
        videoPath,
        previewPath,
      );

      const videoKey = `${VIDEO_FOLDER}/${assetId}.${extension}`;
      await this.putObject(videoKey, media.buffer, contentType);

      let previewImageUrl: string | null = null;
      if (previewBuffer) {
        const previewKey = `${VIDEO_FOLDER}/${assetId}_preview.jpg`;
        await this.putObject(previewKey, previewBuffer, 'image/jpeg');
        this.warmImageVariants(previewKey);
        previewImageUrl = this.publicMediaUrl(previewKey, 'image');
      } else {
        console.warn(
          `[SpacesStorageService] Preview frame extraction failed for ${videoKey}`,
        );
      }

      return {
        videoUrl: this.publicMediaUrl(videoKey, 'video'),
        previewImageUrl,
        width: metadata.width,
        height: metadata.height,
        hasAudio: metadata.hasAudio,
      };
    } finally {
      await fs
        .rm(tempDir, { recursive: true, force: true })
        .catch(() => undefined);
    }
  }

  /**
   * Fire-and-forget pre-generation of the display variants the app requests,
   * so freshly uploaded images never pay the first-hit transform latency.
   */
  private warmImageVariants(key: string): void {
    const proxyBaseUrl = this.configService.get<string>(
      'MEDIA_PROXY_PUBLIC_BASE_URL',
    );
    if (!proxyBaseUrl) return;
    const base = proxyBaseUrl.replace(/\/+$/, '');
    for (const variant of [
      't_yallery_thumb_image_v2',
      't_yallery_feed_image_v2',
      't_yallery_preview_image_v2',
    ]) {
      axios
        .head(`${base}/media/image/upload/${variant}/${key}`, {
          timeout: 120000,
          maxRedirects: 0,
          validateStatus: () => true,
        })
        .catch(() => undefined);
    }
  }

  /** Uploads a public, immutable-cached object (also used by the media proxy for derived variants). */
  async putPublicObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.putObject(key, body, contentType);
  }

  /** True when an object exists in the bucket. */
  async objectExists(key: string): Promise<boolean> {
    try {
      await this.getClient().send(
        new HeadObjectCommand({
          Bucket: this.configService.get<string>('SPACES_BUCKET'),
          Key: key,
        }),
      );
      return true;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (status === 404 || (error as Error).name === 'NotFound') return false;
      throw error;
    }
  }

  /** Downloads an object's bytes via the CDN edge. */
  async getObjectBuffer(key: string): Promise<Buffer> {
    const cap = this.maxObjectBytes();
    try {
      const response = await axios.get<ArrayBuffer>(this.cdnUrl(key), {
        responseType: 'arraybuffer',
        maxContentLength: cap,
        maxBodyLength: cap,
        timeout: OBJECT_FETCH_TIMEOUT_MS,
      });
      return Buffer.from(response.data);
    } catch (error) {
      throw this.mapSizeError(error, key, cap);
    }
  }

  /** Opens an object as a stream — attachment responses pipe this straight to the client. */
  async getObjectStream(key: string): Promise<ObjectStream> {
    const response = await this.getClient().send(
      new GetObjectCommand({
        Bucket: this.configService.get<string>('SPACES_BUCKET'),
        Key: key,
      }),
    );
    if (!response.Body) {
      throw new Error(`Empty response body for object ${key}`);
    }
    return {
      stream: response.Body as Readable,
      contentLength:
        typeof response.ContentLength === 'number'
          ? response.ContentLength
          : null,
      contentType: response.ContentType ?? null,
    };
  }

  private maxObjectBytes(): number {
    const raw = Number(this.configService.get<string>('MEDIA_MAX_OBJECT_BYTES'));
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_OBJECT_BYTES;
  }

  /** Axios rejects cap overruns with a generic error — surface them as ObjectTooLargeError. */
  private mapSizeError(error: unknown, source: string, cap: number): unknown {
    if (
      error instanceof Error &&
      error.message.includes('maxContentLength size of')
    ) {
      return new ObjectTooLargeError(source, cap);
    }
    return error;
  }

  private async putObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: this.configService.get<string>('SPACES_BUCKET'),
        Key: key,
        Body: body,
        ContentType: contentType,
        ACL: 'public-read',
        CacheControl: CACHE_CONTROL,
      }),
    );
  }

  private getClient(): S3Client {
    if (!this.isConfigured()) {
      throw new Error(
        'Spaces storage is not configured (SPACES_REGION/BUCKET/ACCESS_KEY/SECRET_KEY)',
      );
    }
    if (!this.client) {
      const region = this.configService.get<string>('SPACES_REGION');
      this.client = new S3Client({
        region: 'us-east-1',
        endpoint: `https://${region}.digitaloceanspaces.com`,
        credentials: {
          accessKeyId: this.configService.get<string>('SPACES_ACCESS_KEY'),
          secretAccessKey: this.configService.get<string>('SPACES_SECRET_KEY'),
        },
      });
    }
    return this.client;
  }

  /** Direct CDN URL of an object (what the media proxy redirects to). */
  cdnUrl(key: string): string {
    const cdnBaseUrl = this.configService.get<string>('SPACES_CDN_BASE_URL');
    if (cdnBaseUrl) {
      return `${cdnBaseUrl.replace(/\/+$/, '')}/${key}`;
    }
    const bucket = this.configService.get<string>('SPACES_BUCKET');
    const region = this.configService.get<string>('SPACES_REGION');
    return `https://${bucket}.${region}.cdn.digitaloceanspaces.com/${key}`;
  }

  /**
   * URL stored in the DB / returned to clients. When
   * MEDIA_PROXY_PUBLIC_BASE_URL is set it takes the Cloudinary-compatible
   * /media/{image|video}/upload/<key> shape, so the mobile app's named
   * transformations (t_.../ insertion after the upload marker) keep working;
   * otherwise falls back to the raw CDN URL.
   */
  publicMediaUrl(key: string, resourceType: 'image' | 'video'): string {
    const proxyBaseUrl = this.configService.get<string>(
      'MEDIA_PROXY_PUBLIC_BASE_URL',
    );
    if (proxyBaseUrl) {
      return `${proxyBaseUrl.replace(/\/+$/, '')}/media/${resourceType}/upload/${key}`;
    }
    return this.cdnUrl(key);
  }

  /** Sources come from RunPod workers as either http(s) URLs or data: URIs (e.g. LTX returns base64 mp4). */
  private async fetchMedia(
    source: string,
    fallbackContentType: string,
  ): Promise<FetchedMedia> {
    const cap = this.maxObjectBytes();

    const dataUriMatch = source.match(/^data:([^;,]+)?(;base64)?,/);
    if (dataUriMatch) {
      const contentType = dataUriMatch[1] || fallbackContentType;
      const payload = source.slice(dataUriMatch[0].length);
      // Cap before allocating: base64 decodes to ~3/4 of its encoded length,
      // and this branch (LTX returns base64 mp4) is the likeliest in-memory
      // blowup in the worker path — the axios cap below never sees it.
      const decodedBytes = dataUriMatch[2]
        ? Math.floor((payload.length * 3) / 4)
        : payload.length;
      if (decodedBytes > cap) {
        throw new ObjectTooLargeError('data: URI payload', cap);
      }
      const buffer = dataUriMatch[2]
        ? Buffer.from(payload, 'base64')
        : Buffer.from(decodeURIComponent(payload), 'utf8');
      return { buffer, contentType };
    }

    try {
      const response = await axios.get<ArrayBuffer>(source, {
        responseType: 'arraybuffer',
        maxContentLength: cap,
        maxBodyLength: cap,
        timeout: WORKER_FETCH_TIMEOUT_MS,
      });
      const headerContentType = String(
        response.headers?.['content-type'] ?? '',
      ).split(';')[0];
      return {
        buffer: Buffer.from(response.data),
        contentType: headerContentType || fallbackContentType,
      };
    } catch (error) {
      throw this.mapSizeError(error, source, cap);
    }
  }

  private async probeVideo(filePath: string): Promise<{
    width: number | null;
    height: number | null;
    hasAudio: boolean | null;
  }> {
    try {
      const stdout = await this.runProcess('ffprobe', [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_streams',
        filePath,
      ]);
      const parsed = JSON.parse(stdout) as {
        streams?: Array<{
          codec_type?: string;
          width?: number;
          height?: number;
        }>;
      };
      const streams = parsed.streams ?? [];
      const videoStream = streams.find((s) => s.codec_type === 'video');
      const width = Number(videoStream?.width);
      const height = Number(videoStream?.height);
      return {
        width: Number.isFinite(width) && width > 0 ? width : null,
        height: Number.isFinite(height) && height > 0 ? height : null,
        hasAudio: streams.some((s) => s.codec_type === 'audio'),
      };
    } catch (error) {
      console.warn(
        `[SpacesStorageService] ffprobe failed for ${filePath}: ${
          (error as Error).message
        }`,
      );
      return { width: null, height: null, hasAudio: null };
    }
  }

  private async extractPreviewFrame(
    videoPath: string,
    previewPath: string,
  ): Promise<Buffer | null> {
    try {
      await this.runProcess('ffmpeg', [
        '-y',
        '-i',
        videoPath,
        '-frames:v',
        '1',
        '-q:v',
        '2',
        previewPath,
      ]);
      return await fs.readFile(previewPath);
    } catch (error) {
      console.warn(
        `[SpacesStorageService] ffmpeg preview extraction failed: ${
          (error as Error).message
        }`,
      );
      return null;
    }
  }

  private runProcess(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args);
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
