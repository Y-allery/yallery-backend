import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../user/user.service';
import { PaymentEntity } from './entities/payment.entity';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { RewardService } from 'src/reward/reward.service';
import { RewardTypeEnum } from 'src/reward/types/reward-type.enum';

type AdaptyWebhookMeta = {
  method?: string;
  url?: string;
  ip?: string;
  headers?: Record<string, any>;
};

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private productPointsMap: { [key: string]: RewardTypeEnum } = {
    '5000yeps': RewardTypeEnum.PAYMENT_5000,
    '15000yeps': RewardTypeEnum.PAYMENT_15000,
    '30000yeps': RewardTypeEnum.PAYMENT_30000,
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
    private readonly notificationGateway: NotificationGateway,
    private readonly rewardService: RewardService,
  ) {}

  private isDevVerboseWebhookLogging(): boolean {
    return this.configService.get<string>('NODE_ENV') !== 'production';
  }

  async processWebhook(webhookData: Buffer, meta?: AdaptyWebhookMeta): Promise<void> {
    try {
      const dataString = webhookData.toString('utf-8');
      const verbose = this.isDevVerboseWebhookLogging();

      // Full logging in DEV only (requested)
      if (verbose) {
        this.logger.log(`📥 [Adapty webhook] ===== START =====`);
        this.logger.log(`📥 [Adapty webhook] meta: ${JSON.stringify({
          method: meta?.method,
          url: meta?.url,
          ip: meta?.ip,
          headers: meta?.headers,
        })}`);
        this.logger.log(`📥 [Adapty webhook] rawLength=${webhookData.length}`);
        this.logger.log(`📥 [Adapty webhook] rawBody=${dataString}`);
      } else {
        // Keep prod log short
        this.logger.log(`📥 Received webhook data: ${dataString.substring(0, 200)}...`);
      }

      const parsedData = JSON.parse(dataString);
      if (verbose) {
        this.logger.log(`📥 [Adapty webhook] parsedJson=${JSON.stringify(parsedData)}`);
      }

      const profileId = parsedData.customer_user_id;
      const eventType = parsedData.event_type;

      this.logger.log(`🔍 Webhook data - profileId: ${profileId}, eventType: ${eventType}`);

      if (!profileId || !eventType) {
        this.logger.warn(`⚠️ Missing profileId or eventType. profileId: ${profileId}, eventType: ${eventType}`);
        return;
      }

      const user = await this.userService.findById(profileId);

      if (!user) {
        this.logger.warn(`⚠️ User not found with id: ${profileId}`);
        return;
      }

      switch (eventType) {
        case 'non_subscription_purchase':
          const eventProperties = parsedData.event_properties;
          const productId = eventProperties?.vendor_product_id;
          
          this.logger.log(`💰 Processing purchase - productId: ${productId}, userId: ${profileId}`);
          if (verbose) {
            this.logger.log(`💰 [Adapty webhook] event_properties=${JSON.stringify(eventProperties)}`);
          }
          
          if (!productId) {
            this.logger.warn(`⚠️ Missing productId in event_properties`);
            return;
          }

          const pointsToAdd = await this.getPointsForProduct(productId);

          if (pointsToAdd === null) {
            this.logger.error(`❌ Unknown productId: ${productId}`);
            return;
          }

          const isTest = parsedData.is_sandbox === true || parsedData.environment === 'sandbox' || parsedData.test === true;
          if (verbose) {
            this.logger.log(`💰 [Adapty webhook] isTest=${isTest} environment=${parsedData.environment ?? null}`);
            this.logger.log(`💰 [Adapty webhook] userBeforePoints=${user.points} pointsToAdd=${pointsToAdd}`);
          }

          user.points += pointsToAdd;
          await this.userService.updateUser(user);
          await this.notificationGateway.emitProfileUpdate(user.id.toString());
          
          const paymentIntentId = parsedData.transaction_id || parsedData.payment_intent_id || null;
          const amount = eventProperties?.price || eventProperties?.amount || pointsToAdd;
          const currency = eventProperties?.currency || 'USD';

          const payment = this.paymentRepository.create({
            paymentIntentId,
            userId: user.id,
            productId,
            amount: typeof amount === 'number' ? amount : pointsToAdd,
            currency,
            status: 'completed',
          });

          await this.paymentRepository.save(payment);
          
          this.logger.log(
            `✅ Added ${pointsToAdd} points to user ${profileId} for product ${productId} and saved payment record (ID: ${payment.id}, Test: ${isTest})`,
          );
          if (verbose) {
            this.logger.log(`✅ [Adapty webhook] paymentSaved=${JSON.stringify({
              id: payment.id,
              paymentIntentId,
              userId: user.id,
              productId,
              amount: typeof amount === 'number' ? amount : pointsToAdd,
              currency,
              status: 'completed',
            })}`);
            this.logger.log(`📥 [Adapty webhook] ===== END =====`);
          }
          break;

        default:
          this.logger.warn(`⚠️ Unhandled event type: ${eventType}`);
      }
    } catch (error) {
      this.logger.error('❌ Error processing webhook:', error);
      this.logger.error('Error stack:', error.stack);
    }
  }

  private async getPointsForProduct(productId: string): Promise<number | null> {
    const rewardType = this.productPointsMap[productId];
    if (!rewardType) {
      return null;
    }
    // Payment rewards не зберігаються в БД, використовуємо fallback значення
    const fallbackValues: { [key: string]: number } = {
      [RewardTypeEnum.PAYMENT_5000]: 5000,
      [RewardTypeEnum.PAYMENT_15000]: 15000,
      [RewardTypeEnum.PAYMENT_30000]: 30000,
    };
    
    try {
      return await this.rewardService.getRewardPoints(rewardType);
    } catch (error) {
      // Якщо не знайдено в БД, використовуємо fallback
      const fallbackValue = fallbackValues[rewardType];
      if (fallbackValue) {
        this.logger.warn(`⚠️ Reward ${rewardType} not found in DB, using fallback: ${fallbackValue}`);
        return fallbackValue;
      }
      this.logger.error(`❌ Failed to get reward points for ${rewardType}:`, error);
      return null;
    }
  }
}
