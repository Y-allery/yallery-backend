import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { LikeEntity } from './entities/like.entity';
import { CreateLikeDto } from './dto/create.like.dto';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { Repository, DataSource } from 'typeorm';
import { NotificationGateway } from 'src/modules/notifications/notification.gateway';
import { UserService } from 'src/modules/users/user.service';
import { RewardService } from 'src/modules/billing/rewards/reward.service';
import { RewardTypeEnum } from 'src/modules/billing/rewards/types/reward-type.enum';
import { UserActivityService } from 'src/modules/engagement/user-activity/services/user-activity.service';
import { UserNotificationTypeEnum } from 'src/modules/notifications/types/user-notification-type.enum';

@Injectable()
export class LikeService {
  private readonly logger = new Logger(LikeService.name);

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
    const [user, post] = await Promise.all([
      this.userRepository.findOne({ where: { id: userId } }),
      this.postRepository.findOne({
        where: { id: createLikeDto.postId },
        relations: ['user'],
      }),
    ]);

    // post entity logged for debug previously; removed to avoid noisy output
    if (!user || !post) {
      throw new NotFoundException('User or Post not found');
    }

    if (post.user.id === userId) {
      throw new BadRequestException('You cannot like your own post');
    }

    // Reward amounts are fetched before the transaction; the authoritative
    // duplicate-like and balance checks happen INSIDE it (the pre-transaction
    // user.points / existingLike reads were racy — concurrent double-taps both
    // passed them and double-spent).
    const [likeSpendPoints, likeEarnPoints] = await Promise.all([
      this.rewardService.getRewardPointsOrDefault(RewardTypeEnum.LIKE_SPEND, 15),
      this.rewardService.getRewardPointsOrDefault(RewardTypeEnum.LIKE_EARN, 5),
    ]);

    try {
      await this.dataSource.transaction(async (manager) => {
        // Idempotent like: the UNIQUE(userId, postId) index is the source of
        // truth, so concurrent requests can't both insert.
        try {
          await manager
            .getRepository(LikeEntity)
            .save(manager.getRepository(LikeEntity).create({ user, post }));
        } catch (insertError) {
          if (this.isDuplicateLike(insertError)) {
            throw new BadRequestException('You have already liked this post');
          }
          throw insertError;
        }

        // Conditional spend: debits only if the liker still has enough points.
        // affected === 0 means insufficient balance → abort (rolls back the
        // like insert), preventing negative balances and double-spend.
        const spend = await manager
          .getRepository(UserEntity)
          .createQueryBuilder()
          .update(UserEntity)
          .set({ points: () => `points - ${likeSpendPoints}` })
          .where('id = :id', { id: user.id })
          .andWhere('points >= :spend', { spend: likeSpendPoints })
          .execute();

        if (!spend.affected) {
          throw new BadRequestException('User does not have enough points');
        }

        await manager
          .getRepository(UserEntity)
          .increment(
            { id: post.user.id },
            'points',
            likeEarnPoints,
          );
      });

      await Promise.all([
        this.userActivityService.logLikeReceived({
          userId: post.user.id,
          actorUserId: user.id,
          pointsDelta: likeEarnPoints,
          postId: post.id,
          previewUrl: post.imageUrl ?? post.previewImageUrl ?? null,
        }),
        this.userActivityService.logLikeSpent({
          userId: user.id,
          pointsDelta: -likeSpendPoints,
          postId: post.id,
          previewUrl: post.imageUrl ?? post.previewImageUrl ?? null,
        }),
      ]);

      // Best-effort side effects: the like is already committed, so an FCM or
      // socket failure must not fail the request.
      const sideEffects = await Promise.allSettled([
        this.userService.sendPushNotificationIfEnabled(
          post.user.id,
          UserNotificationTypeEnum.LIKE_EARN,
        ),
        this.userService.sendPushNotificationIfEnabled(
          user.id,
          UserNotificationTypeEnum.LIKE_SPEND,
        ),
        this.notificationGateway.emitProfileUpdate(user.id.toString()),
        this.notificationGateway.emitProfileUpdate(post.user.id.toString()),
      ]);
      for (const result of sideEffects) {
        if (result.status === 'rejected') {
          // These no longer fail the request, so this log is the only signal
          // that push/socket delivery is broken — it must reach the Nest
          // logger and Sentry, not raw stdout.
          this.logger.error(
            `createLike post-commit side effect failed: ${result.reason?.message ?? result.reason}`,
            result.reason?.stack,
          );
        }
      }

      return 'success';
    } catch (error) {
      // Preserve intentional HTTP errors (already-liked, insufficient points)
      // with their original status; wrap anything else as a 400 (prior behavior).
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(error.message);
    }
  }

  /** MySQL duplicate-key (ER_DUP_ENTRY / 1062) on the likes unique index. */
  private isDuplicateLike(error: any): boolean {
    const code = error?.driverError?.code ?? error?.code;
    const errno = error?.driverError?.errno ?? error?.errno;
    return code === 'ER_DUP_ENTRY' || errno === 1062;
  }
}
