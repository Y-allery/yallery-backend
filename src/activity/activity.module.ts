import { Module } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { ActivityController } from './activity.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityEntity } from './entities/activity.entity';
import { NotificationPreferenceEntity } from 'src/notification/entity/notification.preferences.entity';
import { NotificationModule } from 'src/notification/notification.module';
import { UserEntity } from 'src/user/entities/user.entity';
import { PostEntity } from 'src/post/entities/post.entity';
import { ViewedPostEntity } from 'src/post/entities/viwed.entity';
import { RewardModule } from 'src/reward/reward.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ActivityEntity, NotificationPreferenceEntity, UserEntity, PostEntity, ViewedPostEntity]),
    NotificationModule,
    RewardModule,
  ],
  providers: [ActivityService],
  controllers: [ActivityController],
  exports: [ActivityService],
})
export class ActivityModule {}
