import { Module } from '@nestjs/common';
import { AdminAISettingsController } from './features/ai-settings/admin-ai-settings.controller';
import { AdminAISettingsService } from './features/ai-settings/admin-ai-settings.service';
import { AISettingsMapper } from './features/ai-settings/ai-settings.mapper';
import { AdminBroadcastController } from './features/broadcast/admin-broadcast.controller';
import { AdminBroadcastService } from './features/broadcast/admin-broadcast.service';
import { AdminCatalogController } from './features/catalog/admin-catalog.controller';
import { AdminCatalogService } from './features/catalog/admin-catalog.service';
import { AdminContestReviewController } from './features/contest-review/admin-contest-review.controller';
import { AdminContestReviewService } from './features/contest-review/admin-contest-review.service';
import { AdminContestsController } from './features/contests/admin-contests.controller';
import { AdminContestsService } from './features/contests/admin-contests.service';
import { AdminFineTuneService } from './features/fine-tunes/admin-finetune.service';
import { AdminFineTunesController } from './features/fine-tunes/admin-finetunes.controller';
import { LoraKeyService } from './features/fine-tunes/lora-key.service';
import { RunpodFineTuneClient } from './features/fine-tunes/runpod-finetune.client';
import { AdminMemesController } from './features/memes/admin-memes.controller';
import { AdminMetricsController } from './features/metrics/admin-metrics.controller';
import { AdminMetricsService } from './features/metrics/admin-metrics.service';
import { AIUsageMetricsCollector } from './features/metrics/collectors/ai-usage.collector';
import { ContestMetricsCollector } from './features/metrics/collectors/contest.collector';
import { PaymentMetricsCollector } from './features/metrics/collectors/payment.collector';
import { PostMetricsCollector } from './features/metrics/collectors/post.collector';
import { MetricsSnapshotBuilder } from './features/metrics/metrics-snapshot.builder';
import { AdminModerationController } from './features/moderation/admin-moderation.controller';
import { AdminModerationService } from './features/moderation/admin-moderation.service';
import { AdminPartnershipService } from './features/partnerships/admin-partnership.service';
import { AdminPartnershipsController } from './features/partnerships/admin-partnerships.controller';
import { BranchLinkService } from './features/partnerships/branch-link.service';
import { PartnerController } from './features/partnerships/partner-referral.controller';
import { ReferralFlagService } from './features/partnerships/referral-flag.service';
import { ContestModule } from 'src/modules/contests/contest.module';
import { UserModule } from 'src/modules/users/user.module';
import { PostModule } from 'src/modules/posts/post.module';
import { TagModule } from 'src/modules/catalog/tags/tag.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PartnershipEntity } from 'src/modules/admin/entities/partner.entity';
import { PartnershipActivityEntity } from 'src/modules/admin/entities/partnership-activity.entity';
import { PartnerUserLinkEntity } from 'src/modules/admin/entities/partner-user-link.entity';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { MediaAISettingsEntity } from 'src/modules/media-generation/persistence/entities/media-ai-settings.entity';
import { AdminMetricsEntity } from 'src/modules/admin/entities/admin-metrics.entity';
import { LikeEntity } from 'src/modules/engagement/likes/entities/like.entity';
import { PaymentEntity } from 'src/modules/billing/payments/entities/payment.entity';
import { RewardModule } from 'src/modules/billing/rewards/reward.module';
import { ContestEntity } from 'src/modules/contests/entity/contest.entity';
import { FirebaseModule } from 'src/integrations/firebase/firebase.module';
import { MailModule } from 'src/integrations/mail/mail.module';
import { DeviceTokenEntity } from 'src/modules/users/entities/device-token.entity';
import { MemeModule } from 'src/modules/memes/meme.module';
import { AIFinetuneEntity } from 'src/modules/admin/entities/ai-finetune.entity';
import { TwitterApiIoModule } from 'src/integrations/twitter-api-io/twitter-api-io.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PartnershipEntity,
      PartnershipActivityEntity,
      PartnerUserLinkEntity,
      PostEntity,
      UserEntity,
      MediaAISettingsEntity,
      AdminMetricsEntity,
      LikeEntity,
      PaymentEntity,
      ContestEntity,
      DeviceTokenEntity,
      AIFinetuneEntity,
    ]),
    ContestModule,
    UserModule,
    PostModule,
    TagModule,
    RewardModule,
    FirebaseModule,
    MailModule,
    MemeModule,
    TwitterApiIoModule,
  ],
  providers: [
    AdminContestsService,
    AdminContestReviewService,
    AdminFineTuneService,
    LoraKeyService,
    RunpodFineTuneClient,
    AdminAISettingsService,
    AISettingsMapper,
    AdminModerationService,
    AdminCatalogService,
    AdminPartnershipService,
    BranchLinkService,
    ReferralFlagService,
    AdminMetricsService,
    MetricsSnapshotBuilder,
    AIUsageMetricsCollector,
    ContestMetricsCollector,
    PaymentMetricsCollector,
    PostMetricsCollector,
    AdminBroadcastService,
  ],
  controllers: [
    AdminContestsController,
    AdminContestReviewController,
    AdminFineTunesController,
    AdminAISettingsController,
    AdminModerationController,
    AdminCatalogController,
    AdminPartnershipsController,
    AdminMetricsController,
    AdminMemesController,
    AdminBroadcastController,
    PartnerController,
  ],
})
export class AdminModule {}
