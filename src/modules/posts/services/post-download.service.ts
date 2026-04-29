import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as sharp from 'sharp';
import { Repository } from 'typeorm';
import { PostEntity } from '../entities/post.entity';

@Injectable()
export class PostDownloadService {
  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
  ) {}

  async getPostImageWithWatermark(
    postId: number,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const post = await this.postRepository.findOne({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.videoUrl) {
      try {
        const response = await axios.get(post.videoUrl, {
          responseType: 'arraybuffer',
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

    let imageBuffer: Buffer;
    try {
      const response = await axios.get(post.imageUrl, {
        responseType: 'arraybuffer',
      });
      imageBuffer = Buffer.from(response.data, 'binary');
    } catch (error) {
      throw new NotFoundException('Error fetching image from URL');
    }

    const watermarkPath = this.resolveWatermarkPath();
    if (!watermarkPath) {
      throw new NotFoundException('Watermark file not found');
    }
    const watermarkBuffer = fs.readFileSync(watermarkPath);

    let processedImageBuffer: Buffer;
    try {
      processedImageBuffer = await sharp(imageBuffer)
        .composite([{ input: watermarkBuffer, gravity: 'southeast' }])
        .toBuffer();
    } catch (error) {
      throw new Error('Error processing image');
    }

    return {
      buffer: processedImageBuffer,
      contentType: 'image/png',
      filename: `post_${postId}.png`,
    };
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
