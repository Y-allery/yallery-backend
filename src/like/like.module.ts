import { Module } from '@nestjs/common';
import { LikeService } from './like.service';
import { LikeController } from './like.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from 'src/user/entities/user.entity';
import { PostEntity } from 'src/post/entities/post.entity';
import { LikeEntity } from './entities/like.entity';
import { NotificationModule } from 'src/notification/notification.module';
import { UserModule } from 'src/user/user.module';
import { RewardModule } from 'src/reward/reward.module';
import { UserActivityModule } from 'src/user-activity/user-activity.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, PostEntity, LikeEntity]),
    NotificationModule,
    UserModule,
    RewardModule,
    UserActivityModule,
  ],
  providers: [LikeService],
  controllers: [LikeController],
})
export class LikeModule {}
