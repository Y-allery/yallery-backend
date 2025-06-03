import { Module, forwardRef } from '@nestjs/common';
import { PostService } from './post.service';
import { PostController } from './post.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostEntity } from './entities/post.entity';
import { TagEntity } from 'src/tag/entities/tag.entity';
import { StyleEntity } from './entities/style.entity';
import { ImageGenerationModule } from 'src/image-generation/image-generation.module';
import { ViewedPostEntity } from './entities/viwed.entity';
import { UserEntity } from 'src/user/entities/user.entity';
import { ContestModule } from 'src/contest/contest.module';
import { ReportPostEntity } from './entities/report.post.entity';
import { ActivityModule } from 'src/activity/activity.module';
import { NotificationModule } from 'src/notification/notification.module';
import { TagModule } from 'src/tag/tag.module';
import { BullModule } from '@nestjs/bullmq';
import { TweetProcessor } from './processors/tweet.processor';

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
    ]),
    forwardRef(() => ImageGenerationModule),
    ContestModule,
    ActivityModule,
    NotificationModule,
    TagModule,
  ],
  providers: [PostService, TweetProcessor],
  controllers: [PostController],
  exports: [PostService],
})
export class PostModule {}
