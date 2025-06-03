import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TagEntity } from './entities/tag.entity';
import { Repository } from 'typeorm';
import { CreateTagDto } from './dto/create.tag.dto';
import { UpdateTagDto } from './dto/update.tag.dto';
import { AssignTagDto } from './dto/assign-tag.dto';
import { PostEntity } from 'src/post/entities/post.entity';
import { UserEntity } from 'src/user/entities/user.entity';

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
  ) {}
  async findAll(): Promise<TagEntity[]> {
    return this.tagModel.find();
  }

  async searchByName(name: string, userId: number): Promise<any[]> {
    const query = this.tagModel
      .createQueryBuilder('tag')
      .leftJoin('tag.users', 'user', 'user.id = :userId', { userId })
      .addSelect('COUNT(user.id) > 0', 'isFollowed')
      .groupBy('tag.id');

    if (name) {
      query.where('tag.name LIKE :name', { name: `%${name}%` });
    }

    const tags = await query.getRawMany();

    return tags.map((tag) => ({
      id: tag.tag_id,
      name: tag.tag_name,
      imageUrl: tag.tag_imageUrl,
      isFollowed: tag.isFollowed === '1',
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
    const deleteResult = await this.tagModel.delete(tagId);
    if (deleteResult.affected === 0) {
      throw new NotFoundException('Tag not found');
    }
  }

  async checkAndSubscribeToTag(user: UserEntity, tag_id: number) {
    const tags = await this.userRepository
      .createQueryBuilder('user')
      .leftJoin('user.tags', 'tag')
      .where('user.id = :userId', { userId: user.id })
      .select(['tag.id', 'tag.name', 'tag.imageUrl'])
      .getRawMany();

    const isSubscribed = tags.some((tag) => tag.tag_id === tag_id);
    console.log(`Is user subscribed to tag ${tag_id}:`, isSubscribed);

    if (!isSubscribed) {
      const tag = await this.tagRepository.findOne({ where: { id: tag_id } });

      if (!tag) {
        throw new Error(`Tag with id ${tag_id} not found`);
      }

      user.tags.push(tag);

      await this.userRepository.save(user);

      console.log(`User ${user.id} successfully subscribed to tag ${tag_id}.`);
    }
  }
}
