import { TranslationsModule } from 'src/modules/translations/translations.module';
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RewardEntity } from './entities/reward.entity';
import { UserRewardEntity } from './entities/user-reward.entity';
import { RewardService } from './reward.service';
import { RewardController } from './reward.controller';
import { UserModule } from 'src/modules/users/user.module';
import { NotificationModule } from 'src/modules/notifications/notification.module';

@Module({
  imports: [
    TranslationsModule,
    TypeOrmModule.forFeature([RewardEntity, UserRewardEntity]),
    forwardRef(() => UserModule),
    NotificationModule,
  ],
  controllers: [RewardController],
  providers: [RewardService],
  exports: [RewardService],
})
export class RewardModule {}
