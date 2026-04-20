import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MemeEntity } from './entities/meme.entity';
import { CreateMemeDto } from './dto/create-meme.dto';
import { UpdateMemeDto } from './dto/update-meme.dto';
import { MEME_GENERATION_QUEUE } from './meme.constants';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PostEntity } from 'src/post/entities/post.entity';
import { UploadService } from 'src/upload/upload.service';
import axios from 'axios';
import * as sharp from 'sharp';

const POPULAR_MEMES_LIMIT = 6;
const KLING_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MEME_SOURCE_FETCH_LIMIT_BYTES = 50 * 1024 * 1024;
const KLING_MIN_DIMENSION = 340;
const KLING_NORMALIZED_MAX_DIMENSION = 3850;
const KLING_MIN_ASPECT_RATIO = 1 / 2.5;
const KLING_MAX_ASPECT_RATIO = 2.5;
const KLING_ALLOWED_IMAGE_FORMATS = new Set(['jpeg', 'jpg', 'png']);
const KLING_COMPRESSION_QUALITIES = [90, 85, 80, 75, 70, 65, 60, 55, 50];

export interface MemeSuggestedTag {
  id: number;
  name: string;
  imageUrl: string;
}

export interface MemeWithGenerationsCount extends MemeEntity {
  generationsCount: number;
  suggestedTags: MemeSuggestedTag[];
}

export interface MemesListResponse {
  popular: MemeWithGenerationsCount[];
  regular: MemeWithGenerationsCount[];
}

export interface MemeSettingsResponse {
  defaultSettings: { cost: number };
}

@Injectable()
export class MemeService {
  private readonly logger = new Logger(MemeService.name);

  private async normalizeSourceImageForMemeGeneration(
    imageUrl: string,
  ): Promise<string> {
    try {
      const headResponse = await axios.head(imageUrl, {
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 400,
      }).catch(() => null);

      const headContentType = headResponse?.headers?.['content-type'];
      const headContentLength = Number(headResponse?.headers?.['content-length']);

      if (
        headContentType &&
        typeof headContentType === 'string' &&
        !headContentType.toLowerCase().startsWith('image/')
      ) {
        throw new BadRequestException(
          'Meme source must be an image URL',
        );
      }

      const imageResponse = await axios.get<ArrayBuffer>(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 20000,
        maxRedirects: 5,
        maxContentLength: MEME_SOURCE_FETCH_LIMIT_BYTES,
        maxBodyLength: MEME_SOURCE_FETCH_LIMIT_BYTES,
        validateStatus: (status) => status >= 200 && status < 400,
      });

      const buffer = Buffer.from(imageResponse.data);

      const metadata = await sharp(buffer, {
        limitInputPixels: false,
      }).metadata();

      const format = metadata.format?.toLowerCase();
      const width = Number(metadata.width);
      const height = Number(metadata.height);

      if (!format || !KLING_ALLOWED_IMAGE_FORMATS.has(format)) {
        throw new BadRequestException(
          'Unsupported image format for meme generation. Use JPG or PNG',
        );
      }

      if (!Number.isFinite(width) || !Number.isFinite(height)) {
        throw new BadRequestException(
          'Could not determine image dimensions for meme generation',
        );
      }

      if (width < KLING_MIN_DIMENSION || height < KLING_MIN_DIMENSION) {
        throw new BadRequestException(
          `Image is too small. Minimum supported size is ${KLING_MIN_DIMENSION}px on each side`,
        );
      }

      const aspectRatio = width / height;
      if (
        aspectRatio < KLING_MIN_ASPECT_RATIO ||
        aspectRatio > KLING_MAX_ASPECT_RATIO
      ) {
        throw new BadRequestException(
          'Image aspect ratio is not supported for meme generation',
        );
      }

      const requiresNormalization =
        buffer.length > KLING_MAX_IMAGE_BYTES ||
        width > KLING_NORMALIZED_MAX_DIMENSION ||
        height > KLING_NORMALIZED_MAX_DIMENSION;

      if (!requiresNormalization) {
        this.logger.log(
          `Meme source image validated without compression: ${width}x${height}, format=${format}, bytes=${buffer.length}`,
        );
        return imageUrl;
      }

      let normalizedBuffer: Buffer | null = null;
      let normalizedWidth = width;
      let normalizedHeight = height;

      for (const quality of KLING_COMPRESSION_QUALITIES) {
        const candidate = await sharp(buffer, {
          limitInputPixels: false,
        })
          .rotate()
          .resize({
            width: KLING_NORMALIZED_MAX_DIMENSION,
            height: KLING_NORMALIZED_MAX_DIMENSION,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({
            quality,
            mozjpeg: true,
            chromaSubsampling: '4:2:0',
          })
          .toBuffer();

        const candidateMetadata = await sharp(candidate, {
          limitInputPixels: false,
        }).metadata();

        normalizedWidth = Number(candidateMetadata.width);
        normalizedHeight = Number(candidateMetadata.height);

        if (candidate.length <= KLING_MAX_IMAGE_BYTES) {
          normalizedBuffer = candidate;
          this.logger.log(
            `Meme source image compressed: ${width}x${height}, ${buffer.length} bytes -> ${normalizedWidth}x${normalizedHeight}, ${candidate.length} bytes, quality=${quality}`,
          );
          break;
        }
      }

      if (!normalizedBuffer) {
        throw new BadRequestException(
          `Image is too large to normalize for meme generation. Maximum supported size is ${Math.floor(
            KLING_MAX_IMAGE_BYTES / (1024 * 1024),
          )}MB`,
        );
      }

      const normalizedUrl = await this.uploadService.uploadByBuffer(
        normalizedBuffer,
        'image/jpeg',
      );

      this.logger.log(
        `Meme source image uploaded after compression: ${normalizedWidth}x${normalizedHeight} -> ${normalizedUrl}`,
      );

      return normalizedUrl;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      if (
        axios.isAxiosError(error) &&
        (error.code === 'ERR_BAD_RESPONSE' || error.code === 'ERR_BAD_REQUEST')
      ) {
        throw new BadRequestException(
          'Failed to validate meme source image. The file may be too large or inaccessible',
        );
      }

      throw new BadRequestException(
        `Failed to validate meme source image: ${error?.message || error}`,
      );
    }
  }

  constructor(
    @InjectRepository(MemeEntity)
    private readonly memeRepository: Repository<MemeEntity>,
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectQueue(MEME_GENERATION_QUEUE)
    private readonly memeGenerationQueue: Queue,
    private readonly uploadService: UploadService,
  ) {}

  getSettings(): MemeSettingsResponse {
    return {
      defaultSettings: { cost: 100 },
    };
  }

  async create(dto: CreateMemeDto): Promise<MemeEntity> {
    const meme = this.memeRepository.create({
      name: dto.name,
      tag: { id: dto.tagId },
      referenceVideoUrl: dto.referenceVideoUrl ?? null,
      referenceImageUrl: dto.referenceImageUrl ?? null,
      isActive: dto.isActive ?? true,
    });
    return this.memeRepository.save(meme);
  }

  async findAll(activeOnly = false): Promise<MemeEntity[]> {
    const where = activeOnly ? { isActive: true } : {};
    return this.memeRepository.find({
      where,
      relations: ['tag'],
      order: { id: 'ASC' },
    });
  }

  /** List active memes as popular (top 6 by generations this month) + regular, with generationsCount per meme */
  async listForApp(): Promise<MemesListResponse> {
    const memes = await this.memeRepository.find({
      where: { isActive: true },
      relations: ['tag'],
      order: { id: 'ASC' },
    });
    if (memes.length === 0) {
      return { popular: [], regular: [] };
    }

    const memeIds = memes.map((m) => m.id);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const qb = this.postRepository
      .createQueryBuilder('p')
      .select('p.generationParams', 'params')
      .addSelect('p.createdAt', 'createdAt')
      .where('p.generationParams IS NOT NULL');
    const posts = await qb.getRawMany();
    const totalByMemeId: Record<number, number> = {};
    const thisMonthByMemeId: Record<number, number> = {};
    memeIds.forEach((id) => {
      totalByMemeId[id] = 0;
      thisMonthByMemeId[id] = 0;
    });
    for (const row of posts) {
      let params = row.params;
      if (typeof params === 'string') {
        try {
          params = JSON.parse(params);
        } catch {
          continue;
        }
      }
      const memeId = params?.memeId;
      if (memeId == null || !memeIds.includes(memeId)) continue;
      totalByMemeId[memeId] = (totalByMemeId[memeId] ?? 0) + 1;
      const createdAt = row.createdAt ? new Date(row.createdAt) : null;
      if (createdAt && createdAt >= monthStart) {
        thisMonthByMemeId[memeId] = (thisMonthByMemeId[memeId] ?? 0) + 1;
      }
    }

    const withCount: MemeWithGenerationsCount[] = memes.map((m) => ({
      ...m,
      generationsCount: totalByMemeId[m.id] ?? 0,
      suggestedTags: m.tag
        ? [{ id: m.tag.id, name: '#' + m.tag.name, imageUrl: m.tag.imageUrl }]
        : [],
    }));

    const sortedByMonth = [...withCount].sort(
      (a, b) => (thisMonthByMemeId[b.id] ?? 0) - (thisMonthByMemeId[a.id] ?? 0),
    );
    const popular = sortedByMonth.slice(0, POPULAR_MEMES_LIMIT);
    const regularIds = new Set(popular.map((m) => m.id));
    const regular = withCount.filter((m) => !regularIds.has(m.id));

    return { popular, regular };
  }

  async findOne(id: number): Promise<MemeEntity> {
    const meme = await this.memeRepository.findOne({
      where: { id },
      relations: ['tag'],
    });
    if (!meme) {
      throw new NotFoundException(`Meme with id ${id} not found`);
    }
    return meme;
  }

  async update(id: number, dto: UpdateMemeDto): Promise<MemeEntity> {
    const meme = await this.findOne(id);
    if (dto.name !== undefined) meme.name = dto.name;
    if (dto.referenceVideoUrl !== undefined) meme.referenceVideoUrl = dto.referenceVideoUrl;
    if (dto.referenceImageUrl !== undefined) meme.referenceImageUrl = dto.referenceImageUrl;
    if (dto.isActive !== undefined) meme.isActive = dto.isActive;
    if (dto.tagId != null) meme.tag = { id: dto.tagId } as any;
    return this.memeRepository.save(meme);
  }

  async remove(id: number): Promise<void> {
    const meme = await this.findOne(id);
    await this.memeRepository.remove(meme);
  }

  async addGenerationToQueue(
    memeId: number,
    imageUrl: string,
    userId: number,
    prompt?: string,
    characterOrientation?: 'image' | 'video',
  ) {
    const meme = await this.findOne(memeId);
    if (!meme.isActive) {
      throw new BadRequestException('This meme template is not active');
    }
    if (!meme.referenceVideoUrl) {
      throw new BadRequestException(
        'Meme template has no reference video; cannot generate',
      );
    }

    const preparedImageUrl =
      await this.normalizeSourceImageForMemeGeneration(imageUrl);

    const job = await this.memeGenerationQueue.add(
      'generate',
      {
        memeId,
        imageUrl: preparedImageUrl,
        userId,
        prompt,
        characterOrientation,
      },
      {
        attempts: 3,
        backoff: 15000,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    this.logger.log(`Job ${job.id} added to queue: memeId=${memeId} userId=${userId}`);
    return { jobId: job.id, message: 'Meme generation task added to queue' };
  }
}
