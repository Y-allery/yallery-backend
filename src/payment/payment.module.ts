import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { UserModule } from 'src/user/user.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentEntity } from './entities/payment.entity';
import { NotificationModule } from 'src/notification/notification.module';
import { RewardModule } from 'src/reward/reward.module';

@Module({
  imports: [
    UserModule,
    TypeOrmModule.forFeature([PaymentEntity]),
    NotificationModule,
    RewardModule,
  ],
  providers: [PaymentService],
  controllers: [PaymentController],
})
export class PaymentModule {}
