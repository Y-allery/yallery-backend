import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContentTranslationEntity } from './entities/content-translation.entity';
import { SupportedLocale, TranslatableEntityType } from './translation.catalog';

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  byLocale: Map<string, Record<string, string>>;
  loadedAt: number;
}

@Injectable()
export class ContentTranslationService {
  /** entityType:entityId -> locale -> fields. Content volume is tiny (dozens of rows). */
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    @InjectRepository(ContentTranslationEntity)
    private readonly repository: Repository<ContentTranslationEntity>,
  ) {}

  async upsert(
    entityType: TranslatableEntityType,
    entityId: number,
    locale: string,
    fields: Record<string, string>,
  ): Promise<void> {
    await this.repository.upsert({ entityType, entityId, locale, fields }, [
      'entityType',
      'entityId',
      'locale',
    ]);
    this.cache.delete(this.cacheKey(entityType, entityId));
  }

  /**
   * Returns the entity's translated fields for the locale, falling back to
   * English, then to the provided original values. Missing individual fields
   * fall through the same chain.
   */
  async resolve<T extends Record<string, unknown>>(
    entityType: TranslatableEntityType,
    entityId: number,
    locale: SupportedLocale | null,
    original: T,
    translatableFields: string[],
  ): Promise<T> {
    if (!locale) return original;
    const byLocale = await this.load(entityType, entityId);
    const exact = byLocale.get(locale);
    const english = byLocale.get('en');
    if (!exact && !english) return original;

    const resolved: Record<string, unknown> = { ...original };
    for (const field of translatableFields) {
      const value = exact?.[field] ?? english?.[field];
      if (typeof value === 'string' && value.length > 0) {
        resolved[field] = value;
      }
    }
    return resolved as T;
  }

  /** Batch variant for list endpoints — one DB roundtrip per cache miss set. */
  async resolveMany<T extends { id: number }>(
    entityType: TranslatableEntityType,
    locale: SupportedLocale | null,
    originals: T[],
    translatableFields: string[],
  ): Promise<T[]> {
    if (!locale || originals.length === 0) return originals;
    return Promise.all(
      originals.map((item) =>
        this.resolve(entityType, item.id, locale, item, translatableFields),
      ),
    );
  }

  async localesFor(
    entityType: TranslatableEntityType,
    entityId: number,
  ): Promise<string[]> {
    const byLocale = await this.load(entityType, entityId);
    return [...byLocale.keys()];
  }

  invalidate(entityType: TranslatableEntityType, entityId: number): void {
    this.cache.delete(this.cacheKey(entityType, entityId));
  }

  private async load(
    entityType: TranslatableEntityType,
    entityId: number,
  ): Promise<Map<string, Record<string, string>>> {
    const key = this.cacheKey(entityType, entityId);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
      return cached.byLocale;
    }
    const rows = await this.repository.find({
      where: { entityType, entityId },
    });
    const byLocale = new Map(rows.map((row) => [row.locale, row.fields]));
    this.cache.set(key, { byLocale, loadedAt: Date.now() });
    return byLocale;
  }

  private cacheKey(entityType: string, entityId: number): string {
    return `${entityType}:${entityId}`;
  }
}
