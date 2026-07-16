import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as sharp from 'sharp';
import { Repository } from 'typeorm';
import { PostEntity } from '../entities/post.entity';

interface DownloadResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

const FETCH_TIMEOUT_MS = 30_000;
const FETCH_MAX_CONTENT_LENGTH = 100 * 1024 * 1024;

@Injectable()
export class PostDownloadService {
  // Watermark file is static; read it from disk once and reuse the buffer.
  private watermarkBuffer: Buffer | null = null;

  // Watermarked images are immutable per post in practice, so cache the
  // composited output. Videos are passed through unwatermarked and can be
  // large, so only image results are cached to bound memory.
  private readonly downloadCache = new Map<number, DownloadResult>();
  private downloadCacheBytes = 0;
  private static readonly DOWNLOAD_CACHE_MAX_ENTRIES = 30;
  private static readonly DOWNLOAD_CACHE_MAX_BYTES = 100 * 1024 * 1024;

  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
  ) {}

  async getPostImageWithWatermark(postId: number): Promise<DownloadResult> {
    const post = await this.postRepository.findOne({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.videoUrl) {
      try {
        const response = await axios.get(post.videoUrl, {
          responseType: 'arraybuffer',
          timeout: FETCH_TIMEOUT_MS,
          maxContentLength: FETCH_MAX_CONTENT_LENGTH,
        });

        return {
          buffer: Buffer.from(response.data, 'binary'),
          contentType: 'video/mp4',
          filename: `post_${postId}.mp4`,
        };
      } catch (error) {
        throw new NotFoundException('Error fetching video from URL');
      }
    }

    const cached = this.downloadCache.get(postId);
    if (cached) {
      // Re-insert to refresh recency (Map preserves insertion order).
      this.downloadCache.delete(postId);
      this.downloadCache.set(postId, cached);
      return cached;
    }

    let imageBuffer: Buffer;
    try {
      const response = await axios.get(post.imageUrl, {
        responseType: 'arraybuffer',
        timeout: FETCH_TIMEOUT_MS,
        maxContentLength: FETCH_MAX_CONTENT_LENGTH,
      });
      imageBuffer = Buffer.from(response.data, 'binary');
    } catch (error) {
      throw new NotFoundException('Error fetching image from URL');
    }

    const watermarkBuffer = await this.getWatermarkBuffer();

    let processedImageBuffer: Buffer;
    try {
      processedImageBuffer = await sharp(imageBuffer)
        .composite([{ input: watermarkBuffer, gravity: 'southeast' }])
        .toBuffer();
    } catch (error) {
      throw new Error('Error processing image');
    }

    const result: DownloadResult = {
      buffer: processedImageBuffer,
      contentType: 'image/png',
      filename: `post_${postId}.png`,
    };
    this.cacheDownload(postId, result);

    return result;
  }

  private async getWatermarkBuffer(): Promise<Buffer> {
    if (this.watermarkBuffer) {
      return this.watermarkBuffer;
    }

    const watermarkPath = this.resolveWatermarkPath();
    if (!watermarkPath) {
      throw new NotFoundException('Watermark file not found');
    }
    this.watermarkBuffer = await fs.promises.readFile(watermarkPath);
    return this.watermarkBuffer;
  }

  private cacheDownload(postId: number, result: DownloadResult): void {
    // An entry bigger than the whole budget would evict every other entry and
    // then itself; skip it rather than flushing the cache for one image.
    if (result.buffer.length > PostDownloadService.DOWNLOAD_CACHE_MAX_BYTES) {
      return;
    }

    // Two concurrent misses for the same post both reach this point, so the key
    // may already be tracked. Subtract what it currently accounts for before
    // re-adding: otherwise downloadCacheBytes drifts above the real total and,
    // once past the cap, evicts every insert forever — a silent 100% miss rate.
    const existing = this.downloadCache.get(postId);
    if (existing) {
      this.downloadCacheBytes -= existing.buffer.length;
      this.downloadCache.delete(postId);
    }

    this.downloadCache.set(postId, result);
    this.downloadCacheBytes += result.buffer.length;

    while (
      this.downloadCache.size > 0 &&
      (this.downloadCache.size > PostDownloadService.DOWNLOAD_CACHE_MAX_ENTRIES ||
        this.downloadCacheBytes > PostDownloadService.DOWNLOAD_CACHE_MAX_BYTES)
    ) {
      const oldestKey = this.downloadCache.keys().next().value;
      const oldest = this.downloadCache.get(oldestKey);
      this.downloadCache.delete(oldestKey);
      this.downloadCacheBytes -= oldest.buffer.length;
    }
  }

  private resolveWatermarkPath(): string | null {
    const candidates = [
      path.join(process.cwd(), 'public', 'watermark.png'),
      path.join(__dirname, '..', '..', 'public', 'watermark.png'),
      path.join(__dirname, '..', '..', '..', '..', 'public', 'watermark.png'),
    ];

    return candidates.find((candidate) => fs.existsSync(candidate)) || null;
  }
}
