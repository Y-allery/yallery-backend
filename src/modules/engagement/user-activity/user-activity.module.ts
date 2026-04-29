import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContestEntity } from 'src/modules/contests/entity/contest.entity';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { ViewedPostEntity } from 'src/modules/posts/entities/viwed.entity';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { UserActivityController } from './controllers/user-activity.controller';
import { UserActivityEntity } from './entities/user-activity.entity';
import { UserActivityQueryService } from './services/user-activity-query.service';
import { UserReadStateService } from './services/user-read-state.service';
import { UserActivityService } from './services/user-activity.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserActivityEntity,
      UserEntity,
      PostEntity,
      ViewedPostEntity,
      ContestEntity,
    ]),
  ],
  controllers: [UserActivityController],
  providers: [
    UserActivityService,
    UserActivityQueryService,
    UserReadStateService,
  ],
  exports: [UserActivityService, UserActivityQueryService, UserReadStateService],
})
export class UserActivityModule {}
