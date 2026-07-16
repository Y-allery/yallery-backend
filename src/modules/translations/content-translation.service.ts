import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContentTranslationEntity } from './entities/content-translation.entity';
import {
  SupportedLocale,
  TRANSLATABLE_FIELDS,
  TranslatableEntityType,
} from './translation.catalog';

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

  /**
   * Localizes `tagName` on feed-shaped rows. Post feeds join tags in raw SQL
   * (`CONCAT('#', t.name) AS tagName`), so the name is baked in before any
   * resolver runs — this patches it back to the caller's locale, preserving
   * the '#' prefix. Resolution is per distinct tag id (cached), not per row.
   */
  async localizeTagNames<
    T extends { tagId?: number | null; tagName?: string | null },
  >(rows: T[], locale: SupportedLocale | null): Promise<T[]> {
    if (!locale || rows.length === 0) return rows;

    const byTagId = new Map<number, string>();
    for (const row of rows) {
      if (!row.tagId || !row.tagName || byTagId.has(row.tagId)) continue;
      const original = row.tagName.replace(/^#/, '');
      const resolved = await this.resolve(
        'tag',
        row.tagId,
        locale,
        { id: row.tagId, name: original },
        TRANSLATABLE_FIELDS.tag,
      );
      byTagId.set(row.tagId, resolved.name);
    }

    return rows.map((row) => {
      if (!row.tagId || !row.tagName) return row;
      const name = byTagId.get(row.tagId);
      return name ? { ...row, tagName: `#${name}` } : row;
    });
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
