import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { LikeEntity } from './entities/like.entity';
import { CreateLikeDto } from './dto/create.like.dto';
import { PostEntity } from 'src/post/entities/post.entity';
import { UserEntity } from 'src/user/entities/user.entity';
import { Repository, DataSource, MoreThanOrEqual } from 'typeorm';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { ActivityService } from 'src/activity/activity.service';
import { ActivityEnum } from 'src/activity/types/activity.enum';
import { ConfigService } from '@nestjs/config';
import { UserService } from 'src/user/user.service';

@Injectable()
export class LikeService {
  constructor(
    @InjectRepository(LikeEntity)
    private readonly likeRepository: Repository<LikeEntity>,
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly notificationGateway: NotificationGateway,
    private readonly userService: UserService,
    private readonly activityService: ActivityService,
    private readonly configService: ConfigService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async createLike(createLikeDto: CreateLikeDto, userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    const post = await this.postRepository.findOne({
      where: { id: createLikeDto.postId },
      relations: ['user'],
    });

    console.log(post);
    if (!user || !post) {
      throw new NotFoundException('User or Post not found');
    }

    if (post.user.id === userId) {
      throw new BadRequestException('You cannot like your own post');
    }

    if (user.points < 15) {
      throw new BadRequestException('User does not have enough points');
    }

    const existingLike = await this.likeRepository.findOne({
      where: { user: { id: userId }, post: { id: createLikeDto.postId } },
    });

    if (existingLike) {
      throw new BadRequestException('You have already liked this post');
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        await manager
          .getRepository(LikeEntity)
          .save(manager.getRepository(LikeEntity).create({ user, post }));

        await manager
          .getRepository(UserEntity)
          .decrement(
            { id: user.id, points: MoreThanOrEqual(15) },
            'points',
            +this.configService.get('LIKE_SPEND_YEPS'),
          );

        await manager
          .getRepository(UserEntity)
          .increment(
            { id: post.user.id },
            'points',
            +this.configService.get('LIKE_EARN_YEPS'),
          );
      });

      const descriptionEarn = await this.activityService.createActivities(
        user.id,
        [post.user.id],
        ActivityEnum.LIKE_EARN,
        undefined,
        false,
        undefined,
        post,
      );

      const descriptionSpend = await this.activityService.createActivities(
        post.user.id,
        [user.id],
        ActivityEnum.LIKE_SPEND,
        undefined,
        false,
        undefined,
        post,
      );
      await this.notificationGateway.sendNotification(
        user.id.toString(),
        descriptionSpend,
        ActivityEnum.LIKE_SPEND,
      );

      await this.notificationGateway.sendNotification(
        post.user.id.toString(),
        descriptionEarn,
        ActivityEnum.LIKE_EARN,
      );

      await this.userService.sendPushNotificationIfEnabled(
        post.user.id,
        ActivityEnum.LIKE_EARN,
      );
      await this.userService.sendPushNotificationIfEnabled(
        user.id,
        ActivityEnum.LIKE_SPEND,
      );

      await this.notificationGateway.emitProfileUpdate(user.id.toString());
      return 'success';
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
