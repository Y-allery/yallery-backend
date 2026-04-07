import { Module } from '@nestjs/common';
import { PostService } from './post.service';
import { PostController } from './post.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostEntity } from './entities/post.entity';
import { TagEntity } from 'src/tag/entities/tag.entity';
import { StyleEntity } from './entities/style.entity';
import { ViewedPostEntity } from './entities/viwed.entity';
import { UserEntity } from 'src/user/entities/user.entity';
import { ContestModule } from 'src/contest/contest.module';
import { ReportPostEntity } from './entities/report.post.entity';
import { NotificationModule } from 'src/notification/notification.module';
import { TagModule } from 'src/tag/tag.module';
import { BullModule } from '@nestjs/bullmq';
import { TweetProcessor } from './processors/tweet.processor';
import { PartnershipActivityEntity } from 'src/admin/entities/partnership-activity.entity';
import { PartnerUserLinkEntity } from 'src/admin/entities/partner-user-link.entity';
import { RewardModule } from 'src/reward/reward.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'tweet-queue' }),
    BullModule.registerQueue({
      name: 'tweet-queue',
    }),
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
  providers: [PostService, TweetProcessor],
  controllers: [PostController],
  exports: [PostService],
})
export class PostModule {}
