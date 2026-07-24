import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisService } from 'src/core/database/redis.service.connect';
import { TelegramService } from 'src/integrations/telegram/telegram.service';
import { MediaGenerationModule } from 'src/modules/media-generation/media-generation.module';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { TagEntity } from 'src/modules/catalog/tags/entities/tag.entity';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { MediaGenerationChargeEntity } from 'src/modules/media-generation/persistence/entities/media-generation-charge.entity';
import { LikeEntity } from 'src/modules/engagement/likes/entities/like.entity';
import { LikeService } from 'src/modules/engagement/likes/like.service';
import { LikeNotificationQueueService } from 'src/modules/engagement/likes/notifications/like-notification-queue.service';
import { LIKE_NOTIFICATIONS_QUEUE } from 'src/modules/engagement/likes/notifications/like-notification.queue';
import { NotificationModule } from 'src/modules/notifications/notification.module';
import { UserModule } from 'src/modules/users/user.module';
import { RewardModule } from 'src/modules/billing/rewards/reward.module';
import { UserActivityModule } from 'src/modules/engagement/user-activity/user-activity.module';
import { ContentBotPlanEntity } from './entities/content-bot-plan.entity';
import { ContentBotService } from './content-bot.service';
import { ContentBotPromptService } from './content-bot-prompt.service';
import { ContentBotCron } from './content-bot.cron';
import { ContentBotController } from './content-bot.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ContentBotPlanEntity,
      PostEntity,
      TagEntity,
      UserEntity,
      MediaGenerationChargeEntity,
      LikeEntity,
    ]),
    // The like path's own dependencies: the bot likes through LikeService, not
    // through a copy of its logic. LikeModule does not export the service, so
    // it is re-provided here from the same source file (stateless, and the
    // notification fan-out is a shared Redis queue either way).
    BullModule.registerQueue({ name: LIKE_NOTIFICATIONS_QUEUE }),
    NotificationModule,
    UserModule,
    RewardModule,
    UserActivityModule,
    MediaGenerationModule,
  ],
  controllers: [ContentBotController],
  providers: [
    ContentBotService,
    ContentBotPromptService,
    ContentBotCron,
    TelegramService,
    RedisService,
    LikeService,
    LikeNotificationQueueService,
  ],
})
export class ContentBotModule {}
