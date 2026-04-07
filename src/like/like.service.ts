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
import { Repository, DataSource } from 'typeorm';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { UserService } from 'src/user/user.service';
import { RewardService } from 'src/reward/reward.service';
import { RewardTypeEnum } from 'src/reward/types/reward-type.enum';
import { UserActivityService } from 'src/user-activity/services/user-activity.service';
import { UserNotificationTypeEnum } from 'src/notification/types/user-notification-type.enum';

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
    private readonly userActivityService: UserActivityService,
    private readonly rewardService: RewardService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async createLike(createLikeDto: CreateLikeDto, userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    const post = await this.postRepository.findOne({
      where: { id: createLikeDto.postId },
      relations: ['user'],
    });

    // post entity logged for debug previously; removed to avoid noisy output
    if (!user || !post) {
      throw new NotFoundException('User or Post not found');
    }

    if (post.user.id === userId) {
      throw new BadRequestException('You cannot like your own post');
    }

    // Отримуємо значення нагород до транзакції
    const likeSpendPoints = await this.rewardService.getRewardPointsOrDefault(
      RewardTypeEnum.LIKE_SPEND,
      15,
    );

    if (user.points < likeSpendPoints) {
      throw new BadRequestException('User does not have enough points');
    }

    const existingLike = await this.likeRepository.findOne({
      where: { user: { id: userId }, post: { id: createLikeDto.postId } },
    });

    if (existingLike) {
      throw new BadRequestException('You have already liked this post');
    }
    const likeEarnPoints = await this.rewardService.getRewardPointsOrDefault(
      RewardTypeEnum.LIKE_EARN,
      5,
    );

    try {
      await this.dataSource.transaction(async (manager) => {
        await manager
          .getRepository(LikeEntity)
          .save(manager.getRepository(LikeEntity).create({ user, post }));

        await manager
          .getRepository(UserEntity)
          .decrement(
            { id: user.id },
            'points',
            likeSpendPoints,
          );

        await manager
          .getRepository(UserEntity)
          .increment(
            { id: post.user.id },
            'points',
            likeEarnPoints,
          );
      });

      await this.userActivityService.logLikeReceived({
        userId: post.user.id,
        actorUserId: user.id,
        pointsDelta: likeEarnPoints,
        postId: post.id,
        previewUrl: post.imageUrl ?? post.previewImageUrl ?? null,
      });

      await this.userActivityService.logLikeSpent({
        userId: user.id,
        pointsDelta: -likeSpendPoints,
        postId: post.id,
        previewUrl: post.imageUrl ?? post.previewImageUrl ?? null,
      });

      await this.userService.sendPushNotificationIfEnabled(
        post.user.id,
        UserNotificationTypeEnum.LIKE_EARN,
      );
      await this.userService.sendPushNotificationIfEnabled(
        user.id,
        UserNotificationTypeEnum.LIKE_SPEND,
      );

      await this.notificationGateway.emitProfileUpdate(user.id.toString());
      await this.notificationGateway.emitProfileUpdate(post.user.id.toString());
      return 'success';
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
