import { Module, forwardRef } from '@nestjs/common';
import { ContestService } from './contest.service';
import { ContestController } from './contest.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContestEntity } from './entity/contest.entity';
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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ContestEntity,
      UserEntity,
      PostEntity,
      TagEntity,
      DeviceTokenEntity,
      MediaAISettingsEntity,
    ]),
    UserModule,
    NotificationModule,
    UserActivityModule,
    FirebaseModule,
    forwardRef(() => RewardModule),
  ],
  providers: [ContestService, RedisService],
  controllers: [ContestController],
  exports: [ContestService],
})
export class ContestModule {}
