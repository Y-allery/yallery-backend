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

const POPULAR_MEMES_LIMIT = 6;

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

  constructor(
    @InjectRepository(MemeEntity)
    private readonly memeRepository: Repository<MemeEntity>,
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectQueue(MEME_GENERATION_QUEUE)
    private readonly memeGenerationQueue: Queue,
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
    const job = await this.memeGenerationQueue.add(
      'generate',
      { memeId, imageUrl, userId, prompt, characterOrientation },
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
