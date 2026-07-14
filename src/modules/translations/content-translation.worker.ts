import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import OpenAI from 'openai';
import { Repository } from 'typeorm';
import { ContestEntity } from 'src/modules/contests/entity/contest.entity';
import { TagEntity } from 'src/modules/catalog/tags/entities/tag.entity';
import { StyleEntity } from 'src/modules/posts/entities/style.entity';
import { MemeEntity } from 'src/modules/memes/entities/meme.entity';
import { RewardEntity } from 'src/modules/billing/rewards/entities/reward.entity';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';
import { ContentTranslationService } from './content-translation.service';
import {
  SUPPORTED_LOCALES,
  TRANSLATABLE_FIELDS,
  TranslatableEntityType,
} from './translation.catalog';

export const CONTENT_TRANSLATION_QUEUE = 'content-translation';
const DEFAULT_TRANSLATION_MODEL = 'gpt-4o-mini';

export interface ContentTranslationJobData {
  entityType: TranslatableEntityType;
  entityId: number;
}

@Injectable()
@Processor(CONTENT_TRANSLATION_QUEUE)
export class ContentTranslationWorker extends WorkerHost {
  private readonly logger = new Logger(ContentTranslationWorker.name);

  constructor(
    @InjectRepository(ContestEntity)
    private readonly contestRepository: Repository<ContestEntity>,
    @InjectRepository(TagEntity)
    private readonly tagRepository: Repository<TagEntity>,
    @InjectRepository(StyleEntity)
    private readonly styleRepository: Repository<StyleEntity>,
    @InjectRepository(MemeEntity)
    private readonly memeRepository: Repository<MemeEntity>,
    @InjectRepository(RewardEntity)
    private readonly rewardRepository: Repository<RewardEntity>,
    private readonly providerRuntimeConfigService: ProviderRuntimeConfigService,
    private readonly contentTranslationService: ContentTranslationService,
  ) {
    super();
  }

  async process(job: Job<ContentTranslationJobData>): Promise<void> {
    const { entityType, entityId } = job.data;
    const source = await this.loadSourceFields(entityType, entityId);
    if (!source) {
      this.logger.warn(`No translatable content for ${entityType}#${entityId}`);
      return;
    }

    const translations = await this.translate(entityType, source);
    for (const [locale, fields] of Object.entries(translations)) {
      await this.contentTranslationService.upsert(
        entityType,
        entityId,
        locale,
        fields,
      );
    }
    this.logger.log(
      `Translated ${entityType}#${entityId} into ${Object.keys(translations).length} locales`,
    );
  }

  private async loadSourceFields(
    entityType: TranslatableEntityType,
    entityId: number,
  ): Promise<Record<string, string> | null> {
    const repositories: Record<TranslatableEntityType, Repository<any>> = {
      contest: this.contestRepository,
      tag: this.tagRepository,
      style: this.styleRepository,
      meme: this.memeRepository,
      reward: this.rewardRepository,
    };
    const entity = await repositories[entityType].findOne({
      where: { id: entityId },
    });
    if (!entity) return null;

    const source: Record<string, string> = {};
    for (const field of TRANSLATABLE_FIELDS[entityType]) {
      const value = entity[field];
      if (typeof value === 'string' && value.trim().length > 0) {
        source[field] = value;
      }
    }
    return Object.keys(source).length > 0 ? source : null;
  }

  /**
   * One batched call: detect the source language, translate the fields into
   * every supported locale (echoing the source text for its own language).
   */
  private async translate(
    entityType: TranslatableEntityType,
    source: Record<string, string>,
  ): Promise<Record<string, Record<string, string>>> {
    const apiKey =
      await this.providerRuntimeConfigService.getString('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    const model =
      (await this.providerRuntimeConfigService.getString(
        'OPENAI_TRANSLATION_MODEL',
      )) || DEFAULT_TRANSLATION_MODEL;

    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You translate short user-facing app content (${entityType} texts of an AI art app).

Translate the JSON object's values into ALL of these locales: ${SUPPORTED_LOCALES.join(', ')}.
Detect the source language yourself and reuse the original text for that locale.

Rules:
- Keep the marketing tone, emoji and approximate length.
- Never translate proper names, hashtags or the app name.
- Return strict JSON: {"<locale>": {"<field>": "<translated>", ...}, ...} with every locale present.`,
        },
        { role: 'user', content: JSON.stringify(source) },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim();
    if (!raw) throw new Error('Empty translation response');
    const parsed = JSON.parse(raw) as Record<string, Record<string, string>>;

    const result: Record<string, Record<string, string>> = {};
    for (const locale of SUPPORTED_LOCALES) {
      const fields = parsed[locale];
      if (!fields || typeof fields !== 'object') continue;
      const clean: Record<string, string> = {};
      for (const field of Object.keys(source)) {
        if (typeof fields[field] === 'string' && fields[field].length > 0) {
          clean[field] = fields[field];
        }
      }
      if (Object.keys(clean).length > 0) result[locale] = clean;
    }
    if (Object.keys(result).length === 0) {
      throw new Error('Translation response contained no usable locales');
    }
    return result;
  }
}
