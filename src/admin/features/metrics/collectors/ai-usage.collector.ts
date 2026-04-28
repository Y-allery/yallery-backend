import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AISettingsEntity } from 'src/media-generation/entities/legacy-ai-settings.entity';
import { PostEntity } from 'src/post/entities/post.entity';

@Injectable()
export class AIUsageMetricsCollector {
  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectRepository(AISettingsEntity)
    private readonly aiSettingsRepository: Repository<AISettingsEntity>,
  ) {}

  async collect(periodStart: Date, periodEnd: Date) {
    const imageAiServices = await this.aiSettingsRepository.find({
      where: { type: 'image', isActive: true },
      select: ['aiService'],
    });
    const videoAiServices = await this.aiSettingsRepository.find({
      where: { type: 'video', isActive: true },
      select: ['aiService'],
    });

    const validImageServices = new Set(
      imageAiServices.map((setting) => setting.aiService),
    );
    const validVideoServices = new Set(
      videoAiServices.map((setting) => setting.aiService),
    );

    const [rawImageAi, rawVideoAi] = await Promise.all([
      this.getRawImageUsage(periodStart, periodEnd),
      this.getRawVideoUsage(periodStart, periodEnd),
    ]);

    return {
      image: this.toUsageStats(rawImageAi, validImageServices, 'flux'),
      video: this.toUsageStats(rawVideoAi, validVideoServices, 'byty_dance'),
    };
  }

  private getRawImageUsage(periodStart: Date, periodEnd: Date) {
    return this.postRepository
      .createQueryBuilder('p')
      .select(
        "JSON_UNQUOTE(JSON_EXTRACT(p.generationParams, '$.aiService'))",
        'ai_service',
      )
      .addSelect('COUNT(*)', 'count')
      .where('p.createdAt >= :start AND p.createdAt < :end', {
        start: periodStart,
        end: periodEnd,
      })
      .andWhere('p.imageUrl IS NOT NULL AND p.imageUrl != :empty', {
        empty: '',
      })
      .groupBy('ai_service')
      .getRawMany();
  }

  private getRawVideoUsage(periodStart: Date, periodEnd: Date) {
    return this.postRepository
      .createQueryBuilder('p')
      .select(
        "JSON_UNQUOTE(JSON_EXTRACT(p.generationParams, '$.aiService'))",
        'ai_service',
      )
      .addSelect('COUNT(*)', 'count')
      .where('p.createdAt >= :start AND p.createdAt < :end', {
        start: periodStart,
        end: periodEnd,
      })
      .andWhere('p.videoUrl IS NOT NULL AND p.videoUrl != :empty', {
        empty: '',
      })
      .groupBy('ai_service')
      .getRawMany();
  }

  private toUsageStats(
    rows: any[],
    validServices: Set<string>,
    fallbackKey: string,
  ): Record<string, { newPosts: number; totalPosts: number }> {
    const stats: Record<string, { newPosts: number; totalPosts: number }> = {};

    for (const row of rows) {
      let key = row.ai_service || fallbackKey;
      if (!validServices.has(key)) {
        key = fallbackKey;
      }
      const count = Number(row.count || 0);
      if (stats[key]) {
        stats[key].newPosts += count;
      } else {
        stats[key] = {
          newPosts: count,
          totalPosts: 0,
        };
      }
    }

    return stats;
  }
}
