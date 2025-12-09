import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RewardEntity } from './entities/reward.entity';
import { RewardService } from './reward.service';
import { RewardController } from './reward.controller';

@Module({
  imports: [TypeOrmModule.forFeature([RewardEntity])],
  controllers: [RewardController],
  providers: [RewardService],
  exports: [RewardService],
})
export class RewardModule {}
