import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContestEntity } from 'src/contest/entity/contest.entity';
import { PostEntity } from 'src/post/entities/post.entity';
import { UserEntity } from 'src/user/entities/user.entity';
import { LegacyActivityCompatController } from './controllers/legacy-activity-compat.controller';
import { UserActivityController } from './controllers/user-activity.controller';
import { UserActivityEntity } from './entities/user-activity.entity';
import { UserActivityQueryService } from './services/user-activity-query.service';
import { UserActivityService } from './services/user-activity.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserActivityEntity,
      UserEntity,
      PostEntity,
      ContestEntity,
    ]),
  ],
  controllers: [UserActivityController, LegacyActivityCompatController],
  providers: [UserActivityService, UserActivityQueryService],
  exports: [UserActivityService, UserActivityQueryService],
})
export class UserActivityModule {}
