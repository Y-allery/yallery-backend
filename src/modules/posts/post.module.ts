import { Module } from '@nestjs/common';
import { PostController } from './post.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostEntity } from './entities/post.entity';
import { TagEntity } from 'src/modules/catalog/tags/entities/tag.entity';
import { StyleEntity } from './entities/style.entity';
import { ViewedPostEntity } from './entities/viwed.entity';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { ContestModule } from 'src/modules/contests/contest.module';
import { ReportPostEntity } from './entities/report.post.entity';
import { NotificationModule } from 'src/modules/notifications/notification.module';
import { TagModule } from 'src/modules/catalog/tags/tag.module';
import { PartnershipActivityEntity } from 'src/modules/admin/entities/partnership-activity.entity';
import { PartnerUserLinkEntity } from 'src/modules/admin/entities/partner-user-link.entity';
import { RewardModule } from 'src/modules/billing/rewards/reward.module';
import { PostDownloadService } from './services/post-download.service';
import { PostFeedService } from './services/post-feed.service';
import { PostModerationService } from './services/post-moderation.service';
import { PostPublishService } from './services/post-publish.service';
import { PostStyleService } from './services/post-style.service';
import { PostViewStateService } from './services/post-view-state.service';

const postServices = [
  PostDownloadService,
  PostFeedService,
  PostModerationService,
  PostPublishService,
  PostStyleService,
  PostViewStateService,
];

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PostEntity,
      TagEntity,
      StyleEntity,
      ViewedPostEntity,
      UserEntity,
      ReportPostEntity,
      PartnershipActivityEntity,
      PartnerUserLinkEntity,
    ]),
    ContestModule,
    NotificationModule,
    TagModule,
    RewardModule,
  ],
  providers: [...postServices],
  controllers: [PostController],
  exports: [...postServices],
})
export class PostModule {}
