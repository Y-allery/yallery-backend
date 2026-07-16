import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MemeEntity } from 'src/modules/memes/entities/meme.entity';
import { CreateMemeDto } from 'src/modules/memes/dto/create-meme.dto';
import { UpdateMemeDto } from 'src/modules/memes/dto/update-meme.dto';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { MediaAISettingsEntity } from 'src/modules/media-generation/persistence/entities/media-ai-settings.entity';

const POPULAR_MEMES_LIMIT = 6;

export interface MemeSuggestedTag {
  id: number;
  name: string;
  imageUrl: string;
}

export interface MemeWithGenerationsCount extends MemeEntity {
  generationsCount: number;
  suggestedTags: MemeSuggestedTag[];
  durationSeconds: number | null;
  billableDurationSeconds: number | null;
  creditsPerSecond: number | null;
  totalCost: number;
  pricingStrategy: 'fixed' | 'per_second';
}

export interface MemesListResponse {
  popular: MemeWithGenerationsCount[];
  regular: MemeWithGenerationsCount[];
}

interface MemeGenerationCountRow {
  memeId: number;
  total: number;
  thisMonth: number;
}

@Injectable()
export class MemeService {
  private generationCountsCache: {
    rows: MemeGenerationCountRow[];
    expiresAt: number;
  } | null = null;
  private static readonly GENERATION_COUNTS_CACHE_TTL_MS = 60_000;

  constructor(
    @InjectRepository(MemeEntity)
    private readonly memeRepository: Repository<MemeEntity>,
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectRepository(MediaAISettingsEntity)
    private readonly mediaAISettingsRepository: Repository<MediaAISettingsEntity>,
  ) {}

  async create(dto: CreateMemeDto): Promise<MemeEntity> {
    const meme = this.memeRepository.create({
      name: dto.name,
      tag: { id: dto.tagId },
      referenceVideoUrl: dto.referenceVideoUrl ?? null,
      referenceVideoDurationSeconds:
        dto.referenceVideoDurationSeconds ?? null,
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
    const memePricing = await this.getMemePricing();
    const countRows = await this.getGenerationCountRows();

    const totalByMemeId: Record<number, number> = {};
    const thisMonthByMemeId: Record<number, number> = {};
    memeIds.forEach((id) => {
      totalByMemeId[id] = 0;
      thisMonthByMemeId[id] = 0;
    });
    for (const row of countRows) {
      if (!memeIds.includes(row.memeId)) continue;
      totalByMemeId[row.memeId] = row.total;
      thisMonthByMemeId[row.memeId] = row.thisMonth;
    }

    const withCount: MemeWithGenerationsCount[] = memes.map((m) => ({
      ...m,
      generationsCount: totalByMemeId[m.id] ?? 0,
      suggestedTags: m.tag
        ? [{ id: m.tag.id, name: '#' + m.tag.name, imageUrl: m.tag.imageUrl }]
        : [],
      ...this.resolveMemeListPricing(m, memePricing),
    }));

    const sortedByMonth = [...withCount].sort(
      (a, b) => (thisMonthByMemeId[b.id] ?? 0) - (thisMonthByMemeId[a.id] ?? 0),
    );
    const popular = sortedByMonth.slice(0, POPULAR_MEMES_LIMIT);
    const regularIds = new Set(popular.map((m) => m.id));
    const regular = withCount.filter((m) => !regularIds.has(m.id));

    return { popular, regular };
  }

  /** Per-meme generation counts (all-time + current month) aggregated in SQL, cached for 60s */
  private async getGenerationCountRows(): Promise<MemeGenerationCountRow[]> {
    const now = Date.now();
    if (
      this.generationCountsCache &&
      this.generationCountsCache.expiresAt > now
    ) {
      return this.generationCountsCache.rows;
    }

    const nowDate = new Date();
    const monthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
    // JSON_TYPE filter mirrors the previous strict memeIds.includes(params.memeId)
    // check: string-typed memeId values were never counted.
    const raw = await this.postRepository.query(
      `
      SELECT
        JSON_EXTRACT(p.generationParams, '$.memeId') AS memeId,
        COUNT(*) AS total,
        SUM(CASE WHEN p.createdAt >= ? THEN 1 ELSE 0 END) AS thisMonth
      FROM posts p
      WHERE p.generationParams IS NOT NULL
        AND JSON_TYPE(JSON_EXTRACT(p.generationParams, '$.memeId')) IN ('INTEGER', 'UNSIGNED INTEGER', 'DOUBLE')
      GROUP BY memeId
      `,
      [monthStart],
    );

    const rows: MemeGenerationCountRow[] = [];
    for (const r of raw as Array<Record<string, unknown>>) {
      const memeId = Number(r.memeId);
      if (!Number.isFinite(memeId)) continue;
      rows.push({
        memeId,
        total: Number(r.total),
        thisMonth: Number(r.thisMonth),
      });
    }
    this.generationCountsCache = {
      rows,
      expiresAt: now + MemeService.GENERATION_COUNTS_CACHE_TTL_MS,
    };
    return rows;
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
    if (dto.referenceVideoDurationSeconds !== undefined) {
      meme.referenceVideoDurationSeconds = dto.referenceVideoDurationSeconds;
    }
    if (dto.referenceImageUrl !== undefined) meme.referenceImageUrl = dto.referenceImageUrl;
    if (dto.isActive !== undefined) meme.isActive = dto.isActive;
    if (dto.tagId != null) meme.tag = { id: dto.tagId } as any;
    return this.memeRepository.save(meme);
  }

  async remove(id: number): Promise<void> {
    const meme = await this.findOne(id);
    await this.memeRepository.remove(meme);
  }

  private async getMemePricing(): Promise<{
    strategy: 'fixed' | 'per_second';
    cost: number;
    creditsPerSecond: number | null;
  }> {
    const setting = await this.mediaAISettingsRepository.findOne({
      where: {
        capability: 'meme_generate',
        isActive: true,
      },
      order: {
        id: 'ASC',
      },
    });
    const pricing = setting?.settings?.pricing;

    if (
      pricing?.strategy === 'per_second' &&
      typeof pricing.creditsPerSecond === 'number' &&
      pricing.creditsPerSecond > 0
    ) {
      return {
        strategy: 'per_second',
        cost: setting.cost,
        creditsPerSecond: pricing.creditsPerSecond,
      };
    }

    return {
      strategy: 'fixed',
      cost: setting?.cost ?? 0,
      creditsPerSecond: null,
    };
  }

  private resolveMemeListPricing(
    meme: MemeEntity,
    pricing: {
      strategy: 'fixed' | 'per_second';
      cost: number;
      creditsPerSecond: number | null;
    },
  ) {
    const durationSeconds =
      typeof meme.referenceVideoDurationSeconds === 'number' &&
      Number.isFinite(meme.referenceVideoDurationSeconds) &&
      meme.referenceVideoDurationSeconds > 0
        ? meme.referenceVideoDurationSeconds
        : null;
    const billableDurationSeconds = durationSeconds
      ? Math.ceil(durationSeconds)
      : null;

    if (
      pricing.strategy === 'per_second' &&
      pricing.creditsPerSecond &&
      billableDurationSeconds
    ) {
      return {
        durationSeconds,
        billableDurationSeconds,
        creditsPerSecond: pricing.creditsPerSecond,
        totalCost: Math.ceil(
          pricing.creditsPerSecond * billableDurationSeconds,
        ),
        pricingStrategy: pricing.strategy,
      };
    }

    return {
      durationSeconds,
      billableDurationSeconds,
      creditsPerSecond: pricing.creditsPerSecond,
      totalCost: pricing.cost,
      pricingStrategy: pricing.strategy,
    };
  }
}
