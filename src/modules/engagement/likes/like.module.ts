import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { LikeService } from './like.service';
import { LikeController } from './like.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { LikeEntity } from './entities/like.entity';
import { NotificationModule } from 'src/modules/notifications/notification.module';
import { UserModule } from 'src/modules/users/user.module';
import { RewardModule } from 'src/modules/billing/rewards/reward.module';
import { UserActivityModule } from 'src/modules/engagement/user-activity/user-activity.module';
import { LikeNotificationQueueService } from './notifications/like-notification-queue.service';
import { LikeNotificationProcessor } from './notifications/like-notification.processor';
import { LIKE_NOTIFICATIONS_QUEUE } from './notifications/like-notification.queue';

@Module({
  imports: [
    BullModule.registerQueue({ name: LIKE_NOTIFICATIONS_QUEUE }),
    TypeOrmModule.forFeature([UserEntity, PostEntity, LikeEntity]),
    NotificationModule,
    UserModule,
    RewardModule,
    UserActivityModule,
  ],
  providers: [
    LikeService,
    LikeNotificationQueueService,
    LikeNotificationProcessor,
  ],
  controllers: [LikeController],
})
export class LikeModule {}
