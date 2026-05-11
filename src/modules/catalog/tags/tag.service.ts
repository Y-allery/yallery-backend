import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TagEntity } from './entities/tag.entity';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CreateTagDto } from './dto/create.tag.dto';
import { UpdateTagDto } from './dto/update.tag.dto';
import { AssignTagDto } from './dto/assign-tag.dto';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { UserEntity } from 'src/modules/users/entities/user.entity';

const FALLBACK_TAG_NAME = 'other';
const FALLBACK_TAG_NAMES = ['other', 'others'];

@Injectable()
export class TagService {
  constructor(
    @InjectRepository(TagEntity)
    private readonly tagModel: Repository<TagEntity>,
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(TagEntity)
    private readonly tagRepository: Repository<TagEntity>,
    private readonly dataSource: DataSource,
  ) {}
  async findAll(): Promise<any[]> {
    const tags = await this.tagModel
      .createQueryBuilder('tag')
      .leftJoin(
        'tag.posts',
        'post',
        'post.isPublished = :isPublished AND post.isBlocked = :isBlocked AND post.isRejected = :isRejected',
        {
          isPublished: true,
          isBlocked: false,
          isRejected: false,
        },
      )
      .select('tag.id', 'tag_id')
      .addSelect('tag.name', 'tag_name')
      .addSelect('tag.imageUrl', 'tag_imageUrl')
      .addSelect('tag.createdAt', 'tag_createdAt')
      .addSelect('tag.updatedAt', 'tag_updatedAt')
      .addSelect('COUNT(DISTINCT post.id)', 'totalPosts')
      .groupBy('tag.id')
      .addGroupBy('tag.name')
      .addGroupBy('tag.imageUrl')
      .addGroupBy('tag.createdAt')
      .addGroupBy('tag.updatedAt')
      .orderBy('tag.id', 'ASC')
      .getRawMany();

    return tags.map((tag) => ({
      id: tag.tag_id,
      name: tag.tag_name,
      imageUrl: tag.tag_imageUrl,
      createdAt: tag.tag_createdAt,
      updatedAt: tag.tag_updatedAt,
      totalPosts: parseInt(tag.totalPosts) || 0,
    }));
  }

  async searchByName(name: string, userId: number): Promise<any[]> {
    const query = this.tagModel
      .createQueryBuilder('tag')
      .leftJoin(
        'tag.posts',
        'post',
        'post.isPublished = :isPublished AND post.isBlocked = :isBlocked AND post.isRejected = :isRejected',
        {
          isPublished: true,
          isBlocked: false,
          isRejected: false,
        },
      )
      .select('tag.id', 'tag_id')
      .addSelect('tag.name', 'tag_name')
      .addSelect('tag.imageUrl', 'tag_imageUrl')
      .addSelect(
        `EXISTS(SELECT 1 FROM users_tags_tags utt WHERE utt.tagsId = tag.id AND utt.usersId = :userId)`,
        'isFollowed',
      )
      .addSelect('COUNT(DISTINCT post.id)', 'totalPosts')
      .setParameter('userId', userId)
      .groupBy('tag.id')
      .addGroupBy('tag.name')
      .addGroupBy('tag.imageUrl')
      .limit(50); // Обмежуємо кількість результатів для продуктивності

    if (name) {
      query.where('tag.name LIKE :name', { name: `%${name}%` });
    }

    const tags = await query.getRawMany();

    return tags.map((tag) => ({
      id: tag.tag_id,
      name: tag.tag_name,
      imageUrl: tag.tag_imageUrl,
      isFollowed: tag.isFollowed === 1 || tag.isFollowed === '1',
      totalPosts: parseInt(tag.totalPosts) || 0,
    }));
  }

  async assignTagToPost(
    assignTagDto: AssignTagDto,
    userId: number,
  ): Promise<void> {
    const { post_id, tag_id } = assignTagDto;

    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { tags: true },
    });
    const post = await this.postRepository.findOne({
      where: { id: post_id },
      relations: ['user'],
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.user.id !== userId) {
      throw new ForbiddenException(
        'You do not have permission to modify this post',
      );
    }

    const tag = await this.tagRepository.findOne({ where: { id: tag_id } });

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    post.tag = tag;
    await this.checkAndSubscribeToTag(user, tag.id);
    await this.postRepository.save(post);
  }

  async create(tagDto: CreateTagDto): Promise<TagEntity> {
    const newTag = this.tagModel.create(tagDto);
    return this.tagModel.save(newTag);
  }

  async update(tagId: number, tagDto: UpdateTagDto): Promise<TagEntity> {
    const tag = await this.tagModel.findOneBy({ id: tagId });
    if (!tag) throw new NotFoundException('Tag not found');

    this.tagModel.merge(tag, tagDto);
    return this.tagModel.save(tag);
  }

  async delete(tagId: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const tagRepository = manager.getRepository(TagEntity);
      const tag = await tagRepository.findOneBy({ id: tagId });

      if (!tag) {
        throw new NotFoundException('Tag not found');
      }

      const fallbackTag = await this.findOrCreateFallbackTag(manager);

      if (tag.id === fallbackTag.id) {
        throw new BadRequestException('Cannot delete fallback tag');
      }

      await manager.query('UPDATE posts SET tagId = ? WHERE tagId = ?', [
        fallbackTag.id,
        tagId,
      ]);
      await manager.query('UPDATE memes SET tagId = ? WHERE tagId = ?', [
        fallbackTag.id,
        tagId,
      ]);
      await manager.query('UPDATE contests SET tagId = ? WHERE tagId = ?', [
        fallbackTag.id,
        tagId,
      ]);
      await manager.query(
        `INSERT IGNORE INTO users_tags_tags (usersId, tagsId)
         SELECT usersId, ? FROM users_tags_tags WHERE tagsId = ?`,
        [fallbackTag.id, tagId],
      );
      await manager.query('DELETE FROM users_tags_tags WHERE tagsId = ?', [
        tagId,
      ]);

      const deleteResult = await tagRepository.delete(tagId);
      if (deleteResult.affected === 0) {
        throw new NotFoundException('Tag not found');
      }
    });
  }

  private async findOrCreateFallbackTag(
    manager: EntityManager,
  ): Promise<TagEntity> {
    const tagRepository = manager.getRepository(TagEntity);
    const fallbackRows = await manager.query(
      `SELECT id, name, imageUrl, createdAt, updatedAt
       FROM tags
       WHERE LOWER(name) IN (?, ?)
       ORDER BY CASE WHEN LOWER(name) = ? THEN 0 ELSE 1 END, id ASC
       LIMIT 1`,
      [...FALLBACK_TAG_NAMES, FALLBACK_TAG_NAME],
    );

    if (fallbackRows.length > 0) {
      return fallbackRows[0] as TagEntity;
    }

    return tagRepository.save(
      tagRepository.create({
        name: FALLBACK_TAG_NAME,
        imageUrl: '',
      }),
    );
  }

  async checkAndSubscribeToTag(user: UserEntity, tag_id: number) {
    const tags = await this.userRepository
      .createQueryBuilder('user')
      .leftJoin('user.tags', 'tag')
      .where('user.id = :userId', { userId: user.id })
      .select(['tag.id', 'tag.name', 'tag.imageUrl'])
      .getRawMany();

    const isSubscribed = tags.some((tag) => tag.tag_id === tag_id);

    if (!isSubscribed) {
      const tag = await this.tagRepository.findOne({ where: { id: tag_id } });

      if (!tag) {
        throw new Error(`Tag with id ${tag_id} not found`);
      }

      user.tags.push(tag);

      await this.userRepository.save(user);

      // User successfully subscribed to tag ${tag_id}
    }
  }
}
