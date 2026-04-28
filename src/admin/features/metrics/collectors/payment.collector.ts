import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { PaymentEntity } from 'src/payment/entities/payment.entity';
import { RewardService } from 'src/reward/reward.service';
import { RewardTypeEnum } from 'src/reward/types/reward-type.enum';

@Injectable()
export class PaymentMetricsCollector {
  private readonly logger = new Logger(PaymentMetricsCollector.name);

  constructor(
    private readonly rewardService: RewardService,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
  ) {}

  async collectPurchasedYeps(periodStart: Date, periodEnd: Date) {
    const payments7D = await this.paymentRepository.find({
      where: {
        createdAt: Between(periodStart, periodEnd),
        status: 'completed',
      },
    });

    const productRewardMap: { [key: string]: RewardTypeEnum } = {
      '5000yeps': RewardTypeEnum.PAYMENT_5000,
      '15000yeps': RewardTypeEnum.PAYMENT_15000,
      '30000yeps': RewardTypeEnum.PAYMENT_30000,
    };

    const paymentFallbackValues: { [key: string]: number } = {
      [RewardTypeEnum.PAYMENT_5000]: 5000,
      [RewardTypeEnum.PAYMENT_15000]: 15000,
      [RewardTypeEnum.PAYMENT_30000]: 30000,
    };

    let purchasedYeps7D = 0;
    for (const payment of payments7D) {
      const rewardType = productRewardMap[payment.productId];
      if (rewardType) {
        try {
          const points = await this.rewardService.getRewardPoints(rewardType);
          purchasedYeps7D += points;
        } catch (error) {
          const fallbackValue = paymentFallbackValues[rewardType];
          if (fallbackValue) {
            purchasedYeps7D += fallbackValue;
          } else {
            this.logger.warn(
              `Failed to get reward points for ${rewardType}:`,
              error,
            );
          }
        }
      }
    }

    return purchasedYeps7D;
  }
}
