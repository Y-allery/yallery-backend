import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { PartnerController } from './partner.controller';
import { AdminAISettingsController } from './controllers/admin-ai-settings.controller';
import { AdminBroadcastController } from './controllers/admin-broadcast.controller';
import { AdminCatalogController } from './controllers/admin-catalog.controller';
import { AdminContestReviewController } from './controllers/admin-contest-review.controller';
import { AdminContestsController } from './controllers/admin-contests.controller';
import { AdminFineTunesController } from './controllers/admin-finetunes.controller';
import { AdminMemesController } from './controllers/admin-memes.controller';
import { AdminMetricsController } from './controllers/admin-metrics.controller';
import { AdminModerationController } from './controllers/admin-moderation.controller';
import { AdminPartnershipsController } from './controllers/admin-partnerships.controller';
import { ContestModule } from 'src/contest/contest.module';
import { UserModule } from 'src/user/user.module';
import { PostModule } from 'src/post/post.module';
import { TagModule } from 'src/tag/tag.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PartnershipEntity } from './entities/partner.entity';
import { PartnershipActivityEntity } from './entities/partnership-activity.entity';
import { PartnerUserLinkEntity } from './entities/partner-user-link.entity';
import { PostEntity } from 'src/post/entities/post.entity';
import { UserEntity } from 'src/user/entities/user.entity';
import { AISettingsEntity } from 'src/media-generation/entities/legacy-ai-settings.entity';
import { MediaAISettingsEntity } from 'src/media-generation/entities/media-ai-settings.entity';
import { AdminMetricsEntity } from './entities/admin-metrics.entity';
import { LikeEntity } from 'src/like/entities/like.entity';
import { PaymentEntity } from 'src/payment/entities/payment.entity';
import { RewardModule } from 'src/reward/reward.module';
import { ContestEntity } from 'src/contest/entity/contest.entity';
import { FirebaseModule } from 'src/firebase/firebase.module';
import { MailModule } from 'src/mail/mail.module';
import { DeviceTokenEntity } from 'src/user/entities/device-token.entity';
import { MemeModule } from 'src/meme/meme.module';
import { AIFinetuneEntity } from './entities/ai-finetune.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PartnershipEntity,
      PartnershipActivityEntity,
      PartnerUserLinkEntity,
      PostEntity,
      UserEntity,
      AISettingsEntity,
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
  ],
  providers: [AdminService],
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
