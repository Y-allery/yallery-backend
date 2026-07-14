import { Repository } from 'typeorm';
import { ContentTranslationService } from './content-translation.service';
import { ContentTranslationEntity } from './entities/content-translation.entity';

const createRepositoryMock = (rows: Partial<ContentTranslationEntity>[]) =>
  ({
    find: jest.fn(async () => rows),
    upsert: jest.fn(async () => undefined),
  }) as unknown as jest.Mocked<Repository<ContentTranslationEntity>>;

describe('ContentTranslationService', () => {
  const contest = { id: 5, name: 'Neon Dreams', description: 'Original text' };

  it('returns the original when locale is null', async () => {
    const repository = createRepositoryMock([]);
    const service = new ContentTranslationService(repository);

    const resolved = await service.resolve('contest', 5, null, contest, [
      'name',
      'description',
    ]);
    expect(resolved).toBe(contest);
    expect(repository.find).not.toHaveBeenCalled();
  });

  it('applies exact-locale fields over the original', async () => {
    const repository = createRepositoryMock([
      { locale: 'uk', fields: { name: 'Неонові сни' } },
      { locale: 'en', fields: { name: 'Neon Dreams', description: 'EN text' } },
    ]);
    const service = new ContentTranslationService(repository);

    const resolved = await service.resolve('contest', 5, 'uk', contest, [
      'name',
      'description',
    ]);
    expect(resolved.name).toBe('Неонові сни');
    // uk row lacks description -> falls back to en
    expect(resolved.description).toBe('EN text');
  });

  it('falls back to the original when no rows exist', async () => {
    const repository = createRepositoryMock([]);
    const service = new ContentTranslationService(repository);

    const resolved = await service.resolve('contest', 5, 'ja', contest, [
      'name',
    ]);
    expect(resolved).toEqual(contest);
  });

  it('caches per entity and invalidates on upsert', async () => {
    const repository = createRepositoryMock([
      { locale: 'es', fields: { name: 'Sueños de neón' } },
    ]);
    const service = new ContentTranslationService(repository);

    await service.resolve('contest', 5, 'es', contest, ['name']);
    await service.resolve('contest', 5, 'es', contest, ['name']);
    expect(repository.find).toHaveBeenCalledTimes(1);

    await service.upsert('contest', 5, 'es', { name: 'X' });
    await service.resolve('contest', 5, 'es', contest, ['name']);
    expect(repository.find).toHaveBeenCalledTimes(2);
  });

  it('resolveMany maps every list item', async () => {
    const repository = createRepositoryMock([
      { locale: 'pl', fields: { name: 'Neonowe sny' } },
    ]);
    const service = new ContentTranslationService(repository);

    const resolved = await service.resolveMany(
      'contest',
      'pl',
      [contest, { id: 6, name: 'Other', description: 'x' }],
      ['name'],
    );
    expect(resolved[0].name).toBe('Neonowe sny');
    expect(resolved[1].name).toBe('Neonowe sny'); // same mocked rows for id 6
  });
});
