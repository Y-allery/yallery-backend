import { BadRequestException } from '@nestjs/common';
import { TagService } from './tag.service';

describe('TagService', () => {
  function buildService(options?: {
    tag?: { id: number; name: string };
    fallbackRows?: Array<{ id: number; name: string; imageUrl: string }>;
    savedFallback?: { id: number; name: string; imageUrl: string };
  }) {
    const tag = options?.tag ?? { id: 67, name: 'delete-me' };
    const fallbackRows = options?.fallbackRows ?? [
      { id: 48, name: 'other', imageUrl: 'https://example.com/other.png' },
    ];
    const savedFallback = options?.savedFallback ?? {
      id: 99,
      name: 'other',
      imageUrl: '',
    };

    const tagRepository = {
      findOneBy: jest.fn().mockResolvedValue(tag),
      create: jest.fn((input) => input),
      save: jest.fn().mockResolvedValue(savedFallback),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue(tagRepository),
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM tags')) {
          return fallbackRows;
        }
        return [];
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (callback) => callback(manager)),
    };
    const service = new TagService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      dataSource as any,
    );

    return { dataSource, manager, service, tagRepository };
  }

  it('reassigns dependent records to the fallback tag before deleting the tag', async () => {
    const { manager, service, tagRepository } = buildService();

    await service.delete(67);

    expect(manager.query).toHaveBeenCalledWith(
      'UPDATE posts SET tagId = ? WHERE tagId = ?',
      [48, 67],
    );
    expect(manager.query).toHaveBeenCalledWith(
      'UPDATE memes SET tagId = ? WHERE tagId = ?',
      [48, 67],
    );
    expect(manager.query).toHaveBeenCalledWith(
      'UPDATE contests SET tagId = ? WHERE tagId = ?',
      [48, 67],
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT IGNORE INTO users_tags_tags'),
      [48, 67],
    );
    expect(manager.query).toHaveBeenCalledWith(
      'DELETE FROM users_tags_tags WHERE tagsId = ?',
      [67],
    );
    expect(tagRepository.delete).toHaveBeenCalledWith(67);
  });

  it('creates the fallback tag when other/others does not exist', async () => {
    const { manager, service, tagRepository } = buildService({
      fallbackRows: [],
      savedFallback: { id: 99, name: 'other', imageUrl: '' },
    });

    await service.delete(67);

    expect(tagRepository.create).toHaveBeenCalledWith({
      name: 'other',
      imageUrl: '',
    });
    expect(tagRepository.save).toHaveBeenCalledWith({
      name: 'other',
      imageUrl: '',
    });
    expect(manager.query).toHaveBeenCalledWith(
      'UPDATE posts SET tagId = ? WHERE tagId = ?',
      [99, 67],
    );
  });

  it('does not delete the fallback tag', async () => {
    const { service, tagRepository } = buildService({
      tag: { id: 48, name: 'other' },
      fallbackRows: [
        { id: 48, name: 'other', imageUrl: 'https://example.com/other.png' },
      ],
    });

    await expect(service.delete(48)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tagRepository.delete).not.toHaveBeenCalled();
  });
});
