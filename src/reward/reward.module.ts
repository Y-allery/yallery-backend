import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RewardEntity } from './entities/reward.entity';
import { UserRewardEntity } from './entities/user-reward.entity';
import { RewardService } from './reward.service';
import { RewardController } from './reward.controller';
import { UserModule } from 'src/user/user.module';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RewardEntity, UserRewardEntity]),
    forwardRef(() => UserModule),
    NotificationModule,
  ],
  controllers: [RewardController],
  providers: [RewardService],
  exports: [RewardService],
})
export class RewardModule {}
