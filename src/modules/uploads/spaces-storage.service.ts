import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import axios from 'axios';
import { spawn } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { StagedPrivateVideoAsset, UploadedVideoAsset } from './upload.types';

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

interface CascadeVideoAssetManifest {
  version: 1;
  videoKey: string;
  previewKey: string | null;
  byteLength: number;
  width: number | null;
  height: number | null;
  hasAudio: boolean | null;
  sourceSha256: string;
}

interface StagedPrivateVideoManifest {
  version: 1;
  privateArtifactRef: string;
  videoKey: string;
  previewKey: string | null;
  byteLength: number;
  sourceSha256: string;
  width: number | null;
  height: number | null;
  hasAudio: boolean | null;
}

export interface ObjectStream {
  stream: Readable;
  /** Size in bytes when the storage layer reports it. */
  contentLength: number | null;
  contentType: string | null;
}

export interface PrivateImmutableObjectWrite {
  key: string;
  body: Buffer;
  contentType: string;
  byteLength: number;
  sha256: string;
  metadata: Readonly<Record<string, string>>;
  maxBytes: number;
}

export interface PrivateStoredObject {
  body: Buffer;
  contentType: string | null;
  contentLength: number | null;
  cacheControl: string | null;
  metadata: Readonly<Record<string, string>>;
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
    return (await this.storeVideoAssetFromSource(source, randomUUID())).asset;
  }

  /**
   * Cascade-only durable materialization. The opaque key yields deterministic
   * object names plus a private commit manifest written last. A retry after the
   * manifest commit performs no provider download, ffmpeg work or object PUT.
   * A crash before commit may repeat work but can only overwrite the same keys,
   * never create a second public asset.
   */
  async uploadVideoAssetFromSourceOnce(
    source: string,
    idempotencyKey: string,
  ): Promise<UploadedVideoAsset> {
    assertVideoIdempotencyKey(idempotencyKey);
    const assetId = createHash('sha256')
      .update(`ltx-cascade-video:${idempotencyKey}`)
      .digest('hex');
    const adopted = await this.readCascadeVideoManifest(assetId);
    if (adopted) {
      return adopted;
    }
    const stored = await this.storeVideoAssetFromSource(
      source,
      `cascade/${assetId}`,
    );
    await this.putPrivateObject(
      `${VIDEO_FOLDER}/cascade/${assetId}.json`,
      Buffer.from(JSON.stringify(stored.manifest), 'utf8'),
      'application/json',
    );
    return stored.asset;
  }

  /**
   * Cascade-only quarantine. The RunPod result is accepted only as an inline
   * MP4 and is stored without an ACL. A private manifest is the commit marker,
   * so retries either adopt the exact same bytes or fail closed.
   */
  async stagePrivateVideoFromDataOnce(
    source: string,
    idempotencyKey: string,
  ): Promise<StagedPrivateVideoAsset> {
    assertVideoIdempotencyKey(idempotencyKey);
    assertStrictMp4DataUri(source);
    const assetId = createHash('sha256')
      .update(`ltx-cascade-stage:${idempotencyKey}`)
      .digest('hex');
    const privateArtifactRef = `video_stage_${assetId}`;
    const media = await this.fetchMedia(source, 'video/mp4');
    if (media.contentType !== 'video/mp4' || media.buffer.byteLength === 0) {
      throw new Error('VIDEO_STAGE_SOURCE_INVALID');
    }
    const sourceSha256 = createHash('sha256')
      .update(media.buffer)
      .digest('hex');

    const adopted = await this.readStagedPrivateVideo(privateArtifactRef);
    if (adopted) {
      if (
        adopted.sourceSha256 !== sourceSha256 ||
        adopted.byteLength !== media.buffer.byteLength
      ) {
        throw new Error('VIDEO_STAGE_IDEMPOTENCY_MISMATCH');
      }
      return adopted;
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-stage-'));
    const videoPath = path.join(tempDir, 'source.mp4');
    const previewPath = path.join(tempDir, 'preview.jpg');
    const videoKey = `${VIDEO_FOLDER}/quarantine/${assetId}.mp4`;
    const previewKey = `${VIDEO_FOLDER}/quarantine/${assetId}_preview.jpg`;
    const manifestKey = `${VIDEO_FOLDER}/quarantine/${assetId}.json`;

    try {
      await fs.writeFile(videoPath, media.buffer);
      const metadata = await this.probeVideo(videoPath);
      const previewBuffer = await this.extractPreviewFrame(
        videoPath,
        previewPath,
      );
      await this.putPrivateObject(videoKey, media.buffer, 'video/mp4');
      if (previewBuffer) {
        await this.putPrivateObject(previewKey, previewBuffer, 'image/jpeg');
      }
      const manifest: StagedPrivateVideoManifest = {
        version: 1,
        privateArtifactRef,
        videoKey,
        previewKey: previewBuffer ? previewKey : null,
        byteLength: media.buffer.byteLength,
        sourceSha256,
        width: metadata.width,
        height: metadata.height,
        hasAudio: metadata.hasAudio,
      };
      await this.putPrivateObject(
        manifestKey,
        Buffer.from(JSON.stringify(manifest), 'utf8'),
        'application/json',
      );
      const committed = await this.readStagedPrivateVideo(privateArtifactRef);
      if (!committed) {
        throw new Error('VIDEO_STAGE_COMMIT_MISSING');
      }
      return committed;
    } finally {
      media.buffer.fill(0);
      await fs
        .rm(tempDir, { recursive: true, force: true })
        .catch(() => undefined);
    }
  }

  async loadStagedPrivateVideo(
    privateArtifactRef: string,
    expectedSha256: string,
  ): Promise<StagedPrivateVideoAsset> {
    assertSha256(expectedSha256);
    const staged = await this.readStagedPrivateVideo(privateArtifactRef);
    if (!staged) {
      throw new Error('VIDEO_STAGE_NOT_FOUND');
    }
    if (staged.sourceSha256 !== expectedSha256) {
      throw new Error('VIDEO_STAGE_HASH_MISMATCH');
    }
    return staged;
  }

  async loadStagedPrivateVideoBytes(
    privateArtifactRef: string,
    expectedSha256: string,
  ): Promise<Buffer> {
    assertSha256(expectedSha256);
    const manifest =
      await this.readStagedPrivateVideoManifest(privateArtifactRef);
    if (!manifest || manifest.sourceSha256 !== expectedSha256) {
      throw new Error('VIDEO_STAGE_HASH_MISMATCH');
    }
    const bytes = await this.getPrivateObjectBuffer(
      manifest.videoKey,
      this.maxObjectBytes(),
    );
    if (
      bytes.byteLength !== manifest.byteLength ||
      createHash('sha256').update(bytes).digest('hex') !== expectedSha256
    ) {
      bytes.fill(0);
      throw new Error('VIDEO_STAGE_HASH_MISMATCH');
    }
    return bytes;
  }

  /**
   * Publishes only a previously committed private stage and only after its
   * exact SHA is supplied by the caller (the persisted, QC-accepted SHA).
   */
  async publishStagedVideoOnce(
    privateArtifactRef: string,
    expectedSha256: string,
    idempotencyKey: string,
  ): Promise<UploadedVideoAsset> {
    assertSha256(expectedSha256);
    assertVideoIdempotencyKey(idempotencyKey);
    const assetId = createHash('sha256')
      .update(`ltx-cascade-publish:${idempotencyKey}`)
      .digest('hex');
    const adopted = await this.readCascadeVideoManifest(
      assetId,
      expectedSha256,
    );
    if (adopted) {
      return adopted;
    }
    const staged = await this.loadStagedPrivateVideo(
      privateArtifactRef,
      expectedSha256,
    );
    const stageManifest =
      await this.readStagedPrivateVideoManifest(privateArtifactRef);
    if (!stageManifest) {
      throw new Error('VIDEO_STAGE_NOT_FOUND');
    }

    const videoBytes = await this.getPrivateObjectBuffer(
      stageManifest.videoKey,
      this.maxObjectBytes(),
    );
    try {
      if (
        videoBytes.byteLength !== staged.byteLength ||
        createHash('sha256').update(videoBytes).digest('hex') !== expectedSha256
      ) {
        throw new Error('VIDEO_STAGE_HASH_MISMATCH');
      }
      const videoKey = `${VIDEO_FOLDER}/cascade/${assetId}.mp4`;
      const previewKey = stageManifest.previewKey
        ? `${VIDEO_FOLDER}/cascade/${assetId}_preview.jpg`
        : null;
      await this.putObject(videoKey, videoBytes, 'video/mp4');
      if (stageManifest.previewKey && previewKey) {
        const previewBytes = await this.getPrivateObjectBuffer(
          stageManifest.previewKey,
          16 * 1024 * 1024,
        );
        try {
          await this.putObject(previewKey, previewBytes, 'image/jpeg');
        } finally {
          previewBytes.fill(0);
        }
      }
      const manifest: CascadeVideoAssetManifest = {
        version: 1,
        videoKey,
        previewKey,
        byteLength: staged.byteLength,
        width: staged.width,
        height: staged.height,
        hasAudio: staged.hasAudio,
        sourceSha256: expectedSha256,
      };
      await this.putPrivateObject(
        `${VIDEO_FOLDER}/cascade/${assetId}.json`,
        Buffer.from(JSON.stringify(manifest), 'utf8'),
        'application/json',
      );
      const published = await this.readCascadeVideoManifest(
        assetId,
        expectedSha256,
      );
      if (!published) {
        throw new Error('VIDEO_ASSET_COMMIT_MISSING');
      }
      return published;
    } finally {
      videoBytes.fill(0);
    }
  }

  /** Idempotent private-stage deletion. Missing objects count as success. */
  async deleteStagedPrivateVideo(privateArtifactRef: string): Promise<void> {
    const manifest =
      await this.readStagedPrivateVideoManifest(privateArtifactRef);
    if (!manifest) {
      return;
    }
    const assetId = parseStagedVideoRef(privateArtifactRef);
    const manifestKey = `${VIDEO_FOLDER}/quarantine/${assetId}.json`;
    for (const key of [manifest.videoKey, manifest.previewKey, manifestKey]) {
      if (!key) continue;
      await this.getClient().send(
        new DeleteObjectCommand({
          Bucket: this.configService.get<string>('SPACES_BUCKET'),
          Key: key,
        }),
      );
    }
  }

  /**
   * Atomically creates a private immutable checkpoint or adopts the exact
   * object already committed at the same key. The conditional PUT prevents a
   * concurrent writer from overwriting different bytes. Every success is
   * followed by a full read-back and metadata/hash comparison.
   */
  async putPrivateImmutableObjectOnce(
    write: Readonly<PrivateImmutableObjectWrite>,
  ): Promise<void> {
    assertPrivateImmutableWrite(write, this.maxObjectBytes());

    let committedOrAlreadyExists = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.getClient().send(
          new PutObjectCommand({
            Bucket: this.configService.get<string>('SPACES_BUCKET'),
            Key: write.key,
            Body: write.body,
            ContentType: write.contentType,
            CacheControl: 'private, no-store, max-age=0',
            Metadata: { ...write.metadata },
            IfNoneMatch: '*',
          }),
        );
        committedOrAlreadyExists = true;
        break;
      } catch (error) {
        if (isPreconditionFailed(error)) {
          committedOrAlreadyExists = true;
          break;
        }
        if (isConditionalWriteConflict(error) && attempt < 2) {
          continue;
        }
        throw error;
      }
    }
    if (!committedOrAlreadyExists) {
      throw new Error('PRIVATE_OBJECT_CONDITIONAL_WRITE_FAILED');
    }

    const stored = await this.readPrivateImmutableObject(
      write.key,
      write.maxBytes,
    );
    try {
      if (
        stored.contentType !== write.contentType ||
        stored.contentLength !== write.byteLength ||
        stored.cacheControl !== 'private, no-store, max-age=0' ||
        !sameStringRecord(stored.metadata, write.metadata) ||
        stored.body.byteLength !== write.byteLength ||
        createHash('sha256').update(stored.body).digest('hex') !==
          write.sha256 ||
        !stored.body.equals(write.body)
      ) {
        throw new Error('PRIVATE_OBJECT_IMMUTABILITY_MISMATCH');
      }
    } finally {
      stored.body.fill(0);
    }
  }

  async readPrivateImmutableObject(
    key: string,
    maxBytes: number,
  ): Promise<PrivateStoredObject> {
    assertPrivateObjectKey(key);
    assertPrivateReadLimit(maxBytes, this.maxObjectBytes());
    return this.getPrivateObjectRecord(key, maxBytes);
  }

  /** Idempotent deletion for an exact private checkpoint key. */
  async deletePrivateImmutableObject(key: string): Promise<void> {
    assertPrivateObjectKey(key);
    await this.getClient().send(
      new DeleteObjectCommand({
        Bucket: this.configService.get<string>('SPACES_BUCKET'),
        Key: key,
      }),
    );
  }

  private async storeVideoAssetFromSource(
    source: string,
    assetId: string,
  ): Promise<{
    asset: UploadedVideoAsset;
    manifest: CascadeVideoAssetManifest;
  }> {
    const media = await this.fetchMedia(source, 'video/mp4');
    const contentType = media.contentType.startsWith('video/')
      ? media.contentType
      : 'video/mp4';
    const extension = EXTENSION_BY_MIME[contentType] ?? 'mp4';

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

      const sourceSha256 = createHash('sha256')
        .update(media.buffer)
        .digest('hex');
      const asset: UploadedVideoAsset = {
        videoUrl: this.publicMediaUrl(videoKey, 'video'),
        previewImageUrl,
        width: metadata.width,
        height: metadata.height,
        hasAudio: metadata.hasAudio,
        sourceSha256,
      };
      return {
        asset,
        manifest: {
          version: 1,
          videoKey,
          previewKey: previewImageUrl
            ? `${VIDEO_FOLDER}/${assetId}_preview.jpg`
            : null,
          byteLength: media.buffer.byteLength,
          width: metadata.width,
          height: metadata.height,
          hasAudio: metadata.hasAudio,
          sourceSha256,
        },
      };
    } finally {
      await fs
        .rm(tempDir, { recursive: true, force: true })
        .catch(() => undefined);
    }
  }

  private async readCascadeVideoManifest(
    assetId: string,
    expectedSha256?: string,
  ): Promise<UploadedVideoAsset | null> {
    const manifestKey = `${VIDEO_FOLDER}/cascade/${assetId}.json`;
    if (!(await this.objectExists(manifestKey))) {
      return null;
    }
    const bytes = await this.getPrivateObjectBuffer(manifestKey, 16 * 1024);
    let manifest: CascadeVideoAssetManifest;
    try {
      manifest = JSON.parse(
        bytes.toString('utf8'),
      ) as CascadeVideoAssetManifest;
    } catch {
      throw new Error('VIDEO_ASSET_MANIFEST_INVALID');
    }
    const expectedVideoPrefix = `${VIDEO_FOLDER}/cascade/${assetId}.`;
    const expectedPreviewKey = `${VIDEO_FOLDER}/cascade/${assetId}_preview.jpg`;
    if (
      !manifest ||
      manifest.version !== 1 ||
      typeof manifest.videoKey !== 'string' ||
      !manifest.videoKey.startsWith(expectedVideoPrefix) ||
      manifest.videoKey.includes('..') ||
      (manifest.previewKey !== null &&
        manifest.previewKey !== expectedPreviewKey) ||
      !Number.isSafeInteger(manifest.byteLength) ||
      manifest.byteLength <= 0 ||
      manifest.byteLength > this.maxObjectBytes() ||
      !isNullablePositiveInteger(manifest.width) ||
      !isNullablePositiveInteger(manifest.height) ||
      (manifest.hasAudio !== null && typeof manifest.hasAudio !== 'boolean') ||
      !/^[a-f0-9]{64}$/.test(manifest.sourceSha256)
    ) {
      throw new Error('VIDEO_ASSET_MANIFEST_INVALID');
    }
    if (
      !(await this.objectExists(manifest.videoKey)) ||
      (manifest.previewKey !== null &&
        !(await this.objectExists(manifest.previewKey)))
    ) {
      throw new Error('VIDEO_ASSET_MANIFEST_INCOMPLETE');
    }
    if (
      expectedSha256 !== undefined &&
      manifest.sourceSha256 !== expectedSha256
    ) {
      throw new Error('VIDEO_ASSET_HASH_MISMATCH');
    }
    const publishedBytes = await this.getPrivateObjectBuffer(
      manifest.videoKey,
      this.maxObjectBytes(),
    );
    try {
      if (
        publishedBytes.byteLength !== manifest.byteLength ||
        createHash('sha256').update(publishedBytes).digest('hex') !==
          manifest.sourceSha256
      ) {
        throw new Error('VIDEO_ASSET_HASH_MISMATCH');
      }
    } finally {
      publishedBytes.fill(0);
    }
    return {
      videoUrl: this.publicMediaUrl(manifest.videoKey, 'video'),
      previewImageUrl: manifest.previewKey
        ? this.publicMediaUrl(manifest.previewKey, 'image')
        : null,
      width: manifest.width,
      height: manifest.height,
      hasAudio: manifest.hasAudio,
      sourceSha256: manifest.sourceSha256,
    };
  }

  private async readStagedPrivateVideo(
    privateArtifactRef: string,
  ): Promise<StagedPrivateVideoAsset | null> {
    const manifest =
      await this.readStagedPrivateVideoManifest(privateArtifactRef);
    if (!manifest) {
      return null;
    }
    if (
      !(await this.objectExists(manifest.videoKey)) ||
      (manifest.previewKey !== null &&
        !(await this.objectExists(manifest.previewKey)))
    ) {
      throw new Error('VIDEO_STAGE_MANIFEST_INCOMPLETE');
    }
    const videoBytes = await this.getPrivateObjectBuffer(
      manifest.videoKey,
      this.maxObjectBytes(),
    );
    try {
      if (
        videoBytes.byteLength !== manifest.byteLength ||
        createHash('sha256').update(videoBytes).digest('hex') !==
          manifest.sourceSha256
      ) {
        throw new Error('VIDEO_STAGE_HASH_MISMATCH');
      }
    } finally {
      videoBytes.fill(0);
    }
    return {
      privateArtifactRef: manifest.privateArtifactRef,
      byteLength: manifest.byteLength,
      sourceSha256: manifest.sourceSha256,
      width: manifest.width,
      height: manifest.height,
      hasAudio: manifest.hasAudio,
    };
  }

  private async readStagedPrivateVideoManifest(
    privateArtifactRef: string,
  ): Promise<StagedPrivateVideoManifest | null> {
    const assetId = parseStagedVideoRef(privateArtifactRef);
    const manifestKey = `${VIDEO_FOLDER}/quarantine/${assetId}.json`;
    if (!(await this.objectExists(manifestKey))) {
      return null;
    }
    const bytes = await this.getPrivateObjectBuffer(manifestKey, 16 * 1024);
    let manifest: StagedPrivateVideoManifest;
    try {
      manifest = JSON.parse(
        bytes.toString('utf8'),
      ) as StagedPrivateVideoManifest;
    } catch {
      throw new Error('VIDEO_STAGE_MANIFEST_INVALID');
    } finally {
      bytes.fill(0);
    }
    const expectedVideoKey = `${VIDEO_FOLDER}/quarantine/${assetId}.mp4`;
    const expectedPreviewKey = `${VIDEO_FOLDER}/quarantine/${assetId}_preview.jpg`;
    const exactKeys = [
      'byteLength',
      'hasAudio',
      'height',
      'previewKey',
      'privateArtifactRef',
      'sourceSha256',
      'version',
      'videoKey',
      'width',
    ];
    if (
      !manifest ||
      Object.keys(manifest).sort().join(',') !== exactKeys.sort().join(',') ||
      manifest.version !== 1 ||
      manifest.privateArtifactRef !== privateArtifactRef ||
      manifest.videoKey !== expectedVideoKey ||
      (manifest.previewKey !== null &&
        manifest.previewKey !== expectedPreviewKey) ||
      !Number.isSafeInteger(manifest.byteLength) ||
      manifest.byteLength <= 0 ||
      manifest.byteLength > this.maxObjectBytes() ||
      !/^[a-f0-9]{64}$/.test(manifest.sourceSha256) ||
      !isNullablePositiveInteger(manifest.width) ||
      !isNullablePositiveInteger(manifest.height) ||
      (manifest.hasAudio !== null && typeof manifest.hasAudio !== 'boolean')
    ) {
      throw new Error('VIDEO_STAGE_MANIFEST_INVALID');
    }
    return manifest;
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
      // v2 stays for the transition: app builds already in the wild still ask for it.
      't_yallery_thumb_image_v2',
      't_yallery_thumb_image_v3',
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
    const raw = Number(
      this.configService.get<string>('MEDIA_MAX_OBJECT_BYTES'),
    );
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

  private async putPrivateObject(
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
      }),
    );
  }

  private async getPrivateObjectBuffer(
    key: string,
    maxBytes: number,
  ): Promise<Buffer> {
    return (await this.getPrivateObjectRecord(key, maxBytes)).body;
  }

  private async getPrivateObjectRecord(
    key: string,
    maxBytes: number,
  ): Promise<PrivateStoredObject> {
    const response = await this.getClient().send(
      new GetObjectCommand({
        Bucket: this.configService.get<string>('SPACES_BUCKET'),
        Key: key,
      }),
    );
    if (
      typeof response.ContentLength === 'number' &&
      response.ContentLength > maxBytes
    ) {
      throw new ObjectTooLargeError(key, maxBytes);
    }
    const body = response.Body as
      | { transformToByteArray?: () => Promise<Uint8Array> }
      | undefined;
    if (!body?.transformToByteArray) {
      throw new Error('OBJECT_BODY_UNAVAILABLE');
    }
    const bytes = Buffer.from(await body.transformToByteArray());
    if (bytes.byteLength > maxBytes) {
      bytes.fill(0);
      throw new ObjectTooLargeError(key, maxBytes);
    }
    return {
      body: bytes,
      contentType: response.ContentType ?? null,
      contentLength:
        typeof response.ContentLength === 'number'
          ? response.ContentLength
          : bytes.byteLength,
      cacheControl: response.CacheControl ?? null,
      metadata: Object.freeze({ ...(response.Metadata ?? {}) }),
    };
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

function isNullablePositiveInteger(value: unknown): value is number | null {
  return value === null || (Number.isSafeInteger(value) && Number(value) > 0);
}

function assertVideoIdempotencyKey(value: string): void {
  if (!/^[A-Za-z0-9:_-]{8,384}$/.test(value)) {
    throw new Error('VIDEO_ASSET_IDEMPOTENCY_KEY_INVALID');
  }
}

function assertSha256(value: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('VIDEO_ASSET_SHA256_INVALID');
  }
}

function assertStrictMp4DataUri(value: string): void {
  const prefix = 'data:video/mp4;base64,';
  if (
    typeof value !== 'string' ||
    !value.startsWith(prefix) ||
    value.length === prefix.length
  ) {
    throw new Error('VIDEO_STAGE_SOURCE_INVALID');
  }
  const payload = value.slice(prefix.length);
  if (
    payload.length % 4 !== 0 ||
    // NOT the grouped form `(?:[A-Za-z0-9+/]{4})*…`: V8 evaluates that group
    // repetition on the stack and throws RangeError past roughly 5 MB of
    // base64, which silently failed every larger clip. A flat character class
    // is iterative, and the length % 4 check above keeps it just as strict.
    !/^[A-Za-z0-9+/]*={0,2}$/.test(payload)
  ) {
    throw new Error('VIDEO_STAGE_SOURCE_INVALID');
  }
}

function parseStagedVideoRef(privateArtifactRef: string): string {
  const match = /^video_stage_([a-f0-9]{64})$/.exec(privateArtifactRef);
  if (!match) {
    throw new Error('VIDEO_STAGE_REF_INVALID');
  }
  return match[1];
}

function assertPrivateImmutableWrite(
  write: Readonly<PrivateImmutableObjectWrite>,
  configuredMaxBytes: number,
): void {
  assertPrivateObjectKey(write?.key);
  assertPrivateReadLimit(write?.maxBytes, configuredMaxBytes);
  if (
    !Buffer.isBuffer(write?.body) ||
    !Number.isSafeInteger(write.byteLength) ||
    write.byteLength <= 0 ||
    write.byteLength > write.maxBytes ||
    write.body.byteLength !== write.byteLength ||
    !/^[a-f0-9]{64}$/.test(write.sha256) ||
    createHash('sha256').update(write.body).digest('hex') !== write.sha256 ||
    !/^[a-z0-9][a-z0-9.+-]{0,63}\/[a-z0-9][a-z0-9.+-]{0,63}$/.test(
      write.contentType,
    ) ||
    !isSafePrivateMetadata(write.metadata)
  ) {
    throw new Error('PRIVATE_OBJECT_WRITE_INVALID');
  }
}

function assertPrivateObjectKey(key: string): void {
  if (
    typeof key !== 'string' ||
    key.length < 16 ||
    key.length > 900 ||
    !key.startsWith('private/') ||
    key.endsWith('/') ||
    key.includes('//') ||
    key.split('/').includes('..') ||
    !/^[A-Za-z0-9._/-]+$/.test(key)
  ) {
    throw new Error('PRIVATE_OBJECT_KEY_INVALID');
  }
}

function assertPrivateReadLimit(
  maxBytes: number,
  configuredMaxBytes: number,
): void {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    maxBytes > configuredMaxBytes
  ) {
    throw new Error('PRIVATE_OBJECT_LIMIT_INVALID');
  }
}

function isSafePrivateMetadata(
  metadata: Readonly<Record<string, string>>,
): boolean {
  const entries =
    metadata && typeof metadata === 'object' ? Object.entries(metadata) : [];
  return (
    entries.length > 0 &&
    entries.length <= 16 &&
    entries.every(
      ([key, value]) =>
        /^[a-z][a-z0-9-]{0,63}$/.test(key) &&
        typeof value === 'string' &&
        value.length > 0 &&
        value.length <= 512 &&
        /^[\x20-\x7e]+$/.test(value),
    )
  );
}

function sameStringRecord(
  actual: Readonly<Record<string, string>>,
  expected: Readonly<Record<string, string>>,
): boolean {
  const actualEntries = Object.entries(actual).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const expectedEntries = Object.entries(expected).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return JSON.stringify(actualEntries) === JSON.stringify(expectedEntries);
}

function isPreconditionFailed(error: unknown): boolean {
  return (
    storageHttpStatus(error) === 412 ||
    (error instanceof Error && error.name === 'PreconditionFailed')
  );
}

function isConditionalWriteConflict(error: unknown): boolean {
  return (
    storageHttpStatus(error) === 409 ||
    (error instanceof Error && error.name === 'ConditionalRequestConflict')
  );
}

function storageHttpStatus(error: unknown): number | undefined {
  return (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
    ?.httpStatusCode;
}
