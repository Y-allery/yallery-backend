import { Repository } from 'typeorm';
import { ContentTranslationService } from './content-translation.service';
import { ContentTranslationEntity } from './entities/content-translation.entity';

const ROWS = [
  {
    entityType: 'tag',
    entityId: 69,
    locale: 'ar',
    fields: { name: 'كرة القدم' },
  },
  {
    entityType: 'tag',
    entityId: 69,
    locale: 'en',
    fields: { name: 'Football' },
  },
  { entityType: 'tag', entityId: 70, locale: 'ar', fields: { name: 'مدينة' } },
];

const createService = () => {
  const find = jest.fn(async ({ where }: any) =>
    ROWS.filter(
      (r) => r.entityType === where.entityType && r.entityId === where.entityId,
    ),
  );
  const service = new ContentTranslationService({
    find,
    upsert: jest.fn(),
  } as unknown as Repository<ContentTranslationEntity>);
  return { service, find };
};

describe('localizeTagNames (feed rows)', () => {
  it('translates tagName and keeps the # prefix', async () => {
    const { service } = createService();

    const rows = await service.localizeTagNames(
      [{ id: 1, tagId: 69, tagName: '#Football' }],
      'ar',
    );

    expect(rows[0].tagName).toBe('#كرة القدم');
  });

  it('resolves once per distinct tag id, not per row', async () => {
    const { service, find } = createService();

    const rows = await service.localizeTagNames(
      [
        { id: 1, tagId: 69, tagName: '#Football' },
        { id: 2, tagId: 69, tagName: '#Football' },
        { id: 3, tagId: 70, tagName: '#City' },
      ],
      'ar',
    );

    expect(rows.map((r) => r.tagName)).toEqual([
      '#كرة القدم',
      '#كرة القدم',
      '#مدينة',
    ]);
    // one DB read per distinct tag (69, 70) — the cache covers the repeat
    expect(find).toHaveBeenCalledTimes(2);
  });

  it('returns rows untouched without a locale', async () => {
    const { service, find } = createService();
    const input = [{ id: 1, tagId: 69, tagName: '#Football' }];

    const rows = await service.localizeTagNames(input, null);

    expect(rows).toBe(input);
    expect(find).not.toHaveBeenCalled();
  });

  it('leaves rows with no tag alone', async () => {
    const { service } = createService();

    const rows = await service.localizeTagNames(
      [{ id: 1, tagId: null, tagName: null }],
      'ar',
    );

    expect(rows[0].tagName).toBeNull();
  });

  it('falls back to the original when the tag has no translations', async () => {
    const { service } = createService();

    const rows = await service.localizeTagNames(
      [{ id: 1, tagId: 999, tagName: '#Untranslated' }],
      'ar',
    );

    expect(rows[0].tagName).toBe('#Untranslated');
  });

  it('falls back to English when the locale is missing', async () => {
    const { service } = createService();

    const rows = await service.localizeTagNames(
      [{ id: 1, tagId: 69, tagName: '#Football' }],
      'ja',
    );

    expect(rows[0].tagName).toBe('#Football');
  });
});
