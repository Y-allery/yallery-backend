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

  describe('findAll caching', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    function buildCachedService() {
      const rawRows = [
        {
          tag_id: 1,
          tag_name: 'cats',
          tag_imageUrl: 'https://example.com/cats.png',
          tag_createdAt: '2026-01-01',
          tag_updatedAt: '2026-01-02',
          totalPosts: '5',
        },
      ];
      const queryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(rawRows),
      };
      const tagModel = {
        createQueryBuilder: jest.fn(() => queryBuilder),
        create: jest.fn((input) => input),
        save: jest.fn(async (input) => ({ id: 2, ...input })),
        findOneBy: jest.fn().mockResolvedValue({ id: 1, name: 'cats' }),
        merge: jest.fn(),
      };
      const deleteRepository = {
        findOneBy: jest.fn().mockResolvedValue({ id: 67, name: 'delete-me' }),
        create: jest.fn((input) => input),
        save: jest.fn().mockResolvedValue({ id: 99, name: 'other' }),
        delete: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const manager = {
        getRepository: jest.fn().mockReturnValue(deleteRepository),
        query: jest.fn(async (sql: string) => {
          if (sql.includes('FROM tags')) {
            return [{ id: 48, name: 'other', imageUrl: '' }];
          }
          return [];
        }),
      };
      const dataSource = {
        transaction: jest.fn(async (callback) => callback(manager)),
      };
      const service = new TagService(
        tagModel as any,
        {} as any,
        {} as any,
        {} as any,
        dataSource as any,
      );

      return { queryBuilder, service, tagModel };
    }

    it('serves cached rows within the TTL and maps the response shape', async () => {
      const { queryBuilder, service } = buildCachedService();

      const first = await service.findAll();
      const second = await service.findAll();

      expect(queryBuilder.getRawMany).toHaveBeenCalledTimes(1);
      expect(second).toBe(first);
      expect(first).toEqual([
        {
          id: 1,
          name: 'cats',
          imageUrl: 'https://example.com/cats.png',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-02',
          totalPosts: 5,
        },
      ]);
    });

    it('re-queries after the TTL expires', async () => {
      const { queryBuilder, service } = buildCachedService();
      const baseNow = Date.now();
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(baseNow);

      await service.findAll();
      nowSpy.mockReturnValue(baseNow + 60_001);
      await service.findAll();

      expect(queryBuilder.getRawMany).toHaveBeenCalledTimes(2);
    });

    it('invalidates the cache on create', async () => {
      const { queryBuilder, service } = buildCachedService();

      await service.findAll();
      await service.create({ name: 'new' } as any);
      await service.findAll();

      expect(queryBuilder.getRawMany).toHaveBeenCalledTimes(2);
    });

    it('invalidates the cache on update', async () => {
      const { queryBuilder, service } = buildCachedService();

      await service.findAll();
      await service.update(1, { name: 'renamed' } as any);
      await service.findAll();

      expect(queryBuilder.getRawMany).toHaveBeenCalledTimes(2);
    });

    it('invalidates the cache on delete', async () => {
      const { queryBuilder, service } = buildCachedService();

      await service.findAll();
      await service.delete(67);
      await service.findAll();

      expect(queryBuilder.getRawMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('checkAndSubscribeToTag', () => {
    function buildSubscribeService(options?: {
      tag?: { id: number; name: string } | null;
    }) {
      const tag =
        options?.tag === undefined ? { id: 5, name: 'dogs' } : options.tag;
      const relationQueryBuilder = {
        of: jest.fn().mockReturnThis(),
        add: jest.fn().mockResolvedValue(undefined),
      };
      const selectQueryBuilder = {
        relation: jest.fn(() => relationQueryBuilder),
      };
      const userRepository = {
        createQueryBuilder: jest.fn(() => selectQueryBuilder),
        save: jest.fn(),
      };
      const tagRepository = {
        findOne: jest.fn().mockResolvedValue(tag),
      };
      const service = new TagService(
        {} as any,
        {} as any,
        userRepository as any,
        tagRepository as any,
        {} as any,
      );

      return { relationQueryBuilder, service, tagRepository, userRepository };
    }

    it('does nothing when the user is already subscribed', async () => {
      const { relationQueryBuilder, service, tagRepository, userRepository } =
        buildSubscribeService();
      const user = { id: 1, tags: [{ id: 5, name: 'dogs' }] } as any;

      await service.checkAndSubscribeToTag(user, 5);

      expect(tagRepository.findOne).not.toHaveBeenCalled();
      expect(relationQueryBuilder.add).not.toHaveBeenCalled();
      expect(userRepository.save).not.toHaveBeenCalled();
      expect(user.tags).toHaveLength(1);
    });

    it('adds a single join row without saving the whole user', async () => {
      const { relationQueryBuilder, service, userRepository } =
        buildSubscribeService();
      const user = { id: 1, tags: [{ id: 2, name: 'cats' }] } as any;

      await service.checkAndSubscribeToTag(user, 5);

      expect(relationQueryBuilder.of).toHaveBeenCalledWith(user);
      expect(relationQueryBuilder.add).toHaveBeenCalledWith({
        id: 5,
        name: 'dogs',
      });
      expect(userRepository.save).not.toHaveBeenCalled();
      expect(user.tags).toEqual([
        { id: 2, name: 'cats' },
        { id: 5, name: 'dogs' },
      ]);
    });

    it('throws when the tag does not exist', async () => {
      const { relationQueryBuilder, service } = buildSubscribeService({
        tag: null,
      });
      const user = { id: 1, tags: [] } as any;

      await expect(service.checkAndSubscribeToTag(user, 5)).rejects.toThrow(
        'Tag with id 5 not found',
      );
      expect(relationQueryBuilder.add).not.toHaveBeenCalled();
    });
  });

  describe('assignTagToPost', () => {
    it('loads user and post, assigns the tag and saves the post', async () => {
      const user = { id: 1, tags: [{ id: 5, name: 'dogs' }] };
      const post = { id: 10, user: { id: 1 }, tag: null };
      const tag = { id: 5, name: 'dogs' };
      const userRepository = {
        findOne: jest.fn().mockResolvedValue(user),
      };
      const postRepository = {
        findOne: jest.fn().mockResolvedValue(post),
        save: jest.fn().mockResolvedValue(post),
      };
      const tagRepository = {
        findOne: jest.fn().mockResolvedValue(tag),
      };
      const service = new TagService(
        {} as any,
        postRepository as any,
        userRepository as any,
        tagRepository as any,
        {} as any,
      );

      await service.assignTagToPost({ post_id: 10, tag_id: 5 } as any, 1);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: { tags: true },
      });
      expect(postRepository.findOne).toHaveBeenCalledWith({
        where: { id: 10 },
        relations: ['user'],
      });
      expect(postRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 10, tag }),
      );
    });
  });
});
