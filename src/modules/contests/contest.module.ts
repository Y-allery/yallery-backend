import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';
import { ContestService } from './contest.service';
import { ContestFlowService } from './contest-flow.service';
import { ContestController } from './contest.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContestEntity } from './entity/contest.entity';
import { ContestFlowMetadataEntity } from './entity/contest-flow-metadata.entity';
import { ContestReviewActionEntity } from './entity/contest-review-action.entity';
import { ContestRewardEntity } from './entity/contest-reward.entity';
import { ContestSubmissionEntity } from './entity/contest-submission.entity';
import { ContestWinnerCandidateEntity } from './entity/contest-winner-candidate.entity';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { UserModule } from 'src/modules/users/user.module';
import { TagEntity } from 'src/modules/catalog/tags/entities/tag.entity';
import { NotificationModule } from 'src/modules/notifications/notification.module';
import { UserActivityModule } from 'src/modules/engagement/user-activity/user-activity.module';
import { FirebaseModule } from 'src/integrations/firebase/firebase.module';
import { RedisService } from 'src/core/database/redis.service.connect';
import { RewardModule } from 'src/modules/billing/rewards/reward.module';
import { DeviceTokenEntity } from 'src/modules/users/entities/device-token.entity';
import { MediaAISettingsEntity } from 'src/modules/media-generation/persistence/entities/media-ai-settings.entity';
import { AIFinetuneEntity } from 'src/modules/admin/entities/ai-finetune.entity';
import { UserActivityEntity } from 'src/modules/engagement/user-activity/entities/user-activity.entity';
import { ContestStartNotificationQueueService } from './notifications/contest-start-notification-queue.service';
import { ContestStartNotificationProcessor } from './notifications/contest-start-notification.processor';
import { CONTEST_START_NOTIFICATIONS_QUEUE } from './notifications/contest-start-notification.queue';
import { TwitterApiIoModule } from 'src/integrations/twitter-api-io/twitter-api-io.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: CONTEST_START_NOTIFICATIONS_QUEUE }),
    TypeOrmModule.forFeature([
      ContestEntity,
      ContestFlowMetadataEntity,
      ContestReviewActionEntity,
      ContestRewardEntity,
      ContestSubmissionEntity,
      ContestWinnerCandidateEntity,
      UserEntity,
      PostEntity,
      TagEntity,
      DeviceTokenEntity,
      MediaAISettingsEntity,
      AIFinetuneEntity,
      UserActivityEntity,
    ]),
    UserModule,
    NotificationModule,
    UserActivityModule,
    FirebaseModule,
    forwardRef(() => RewardModule),
    TwitterApiIoModule,
  ],
  providers: [
    ContestService,
    ContestFlowService,
    ContestStartNotificationQueueService,
    ContestStartNotificationProcessor,
    RedisService,
  ],
  controllers: [ContestController],
  exports: [
    ContestService,
    ContestFlowService,
    ContestStartNotificationQueueService,
  ],
})
export class ContestModule {}
