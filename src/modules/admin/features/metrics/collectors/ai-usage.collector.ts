import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { MediaAISettingsEntity } from 'src/modules/media-generation/persistence/entities/media-ai-settings.entity';
import { MediaCapability } from 'src/modules/media-generation/domain/enums/media-capability.enum';

@Injectable()
export class AIUsageMetricsCollector {
  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectRepository(MediaAISettingsEntity)
    private readonly mediaAISettingsRepository: Repository<MediaAISettingsEntity>,
  ) {}

  async collect(periodStart: Date, periodEnd: Date) {
    const imageAiServices = await this.mediaAISettingsRepository.find({
      where: {
        capability: In([
          MediaCapability.IMAGE_GENERATE,
          MediaCapability.IMAGE_EDIT,
        ]),
        isActive: true,
      },
      select: ['aiService'],
    });
    const videoAiServices = await this.mediaAISettingsRepository.find({
      where: { capability: MediaCapability.VIDEO_GENERATE, isActive: true },
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
      image: this.toUsageStats(rawImageAi, validImageServices, 'flux2_klein'),
      video: this.toUsageStats(rawVideoAi, validVideoServices, 'p_video_text'),
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
