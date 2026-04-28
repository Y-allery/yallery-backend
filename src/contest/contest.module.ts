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
import { UserEntity } from 'src/user/entities/user.entity';
import { PostEntity } from 'src/post/entities/post.entity';
import { UserModule } from 'src/user/user.module';
import { TagEntity } from 'src/tag/entities/tag.entity';
import { NotificationModule } from 'src/notification/notification.module';
import { UserActivityModule } from 'src/user-activity/user-activity.module';
import { FirebaseModule } from 'src/firebase/firebase.module';
import { RedisService } from 'src/database/redis.service.connect';
import { RewardModule } from 'src/reward/reward.module';
import { DeviceTokenEntity } from 'src/user/entities/device-token.entity';
import { MediaAISettingsEntity } from 'src/media-generation/entities/media-ai-settings.entity';
import { AIFinetuneEntity } from 'src/admin/entities/ai-finetune.entity';

@Module({
  imports: [
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
    ]),
    UserModule,
    NotificationModule,
    UserActivityModule,
    FirebaseModule,
    forwardRef(() => RewardModule),
  ],
  providers: [ContestService, ContestFlowService, RedisService],
  controllers: [ContestController],
  exports: [ContestService, ContestFlowService],
})
export class ContestModule {}
