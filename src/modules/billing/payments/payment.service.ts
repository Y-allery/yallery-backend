import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { UserService } from 'src/modules/users/user.service';
import { PaymentEntity } from './entities/payment.entity';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { NotificationGateway } from 'src/modules/notifications/notification.gateway';
import { RewardService } from 'src/modules/billing/rewards/reward.service';
import { RewardTypeEnum } from 'src/modules/billing/rewards/types/reward-type.enum';

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

          // Idempotency key: a stable provider id is REQUIRED. Without one we
          // cannot dedupe Adapty's at-least-once retries, so we refuse to credit
          // rather than risk minting points twice. (paymentIntentId is a UNIQUE
          // column but allows multiple NULLs, so null-id events would bypass
          // dedup entirely — hence the hard reject here.)
          const paymentIntentId =
            parsedData.transaction_id || parsedData.payment_intent_id || null;
          if (!paymentIntentId) {
            this.logger.error(
              `❌ Purchase for user ${profileId} (product ${productId}) has no transaction id — refusing to credit without an idempotency key`,
            );
            return;
          }

          const rawAmount =
            eventProperties?.price ?? eventProperties?.amount ?? pointsToAdd;
          const amount = typeof rawAmount === 'number' ? rawAmount : pointsToAdd;
          const currency = eventProperties?.currency || 'USD';

          if (verbose) {
            this.logger.log(`💰 [Adapty webhook] isTest=${isTest} environment=${parsedData.environment ?? null}`);
            this.logger.log(`💰 [Adapty webhook] userBeforePoints=${user.points} pointsToAdd=${pointsToAdd}`);
          }

          // Idempotency-FIRST + atomic credit in a single transaction: insert the
          // payment keyed on the unique paymentIntentId BEFORE crediting. A
          // duplicate delivery hits the unique index (caught below) and we skip
          // the credit; a mid-transaction crash rolls back the insert so a retry
          // reprocesses cleanly. Points use an atomic increment (not a
          // read-modify-write save) so concurrent deliveries can't lose updates.
          try {
            await this.paymentRepository.manager.transaction(async (manager) => {
              await manager.getRepository(PaymentEntity).insert({
                paymentIntentId,
                userId: user.id,
                productId,
                amount,
                currency,
                status: 'completed',
              });

              await manager
                .getRepository(UserEntity)
                .increment({ id: user.id }, 'points', pointsToAdd);
            });
          } catch (txError) {
            if (this.isDuplicatePayment(txError)) {
              this.logger.warn(
                `↩️ Duplicate Adapty webhook for transaction ${paymentIntentId} — already processed, skipping`,
              );
              return;
            }
            throw txError; // genuine failure → controller returns 500 → Adapty retries
          }

          await this.notificationGateway.emitProfileUpdate(user.id.toString());

          this.logger.log(
            `✅ Added ${pointsToAdd} points to user ${profileId} for product ${productId} (transaction ${paymentIntentId}, Test: ${isTest})`,
          );
          if (verbose) {
            this.logger.log(`📥 [Adapty webhook] ===== END =====`);
          }
          break;

        default:
          this.logger.warn(`⚠️ Unhandled event type: ${eventType}`);
      }
    } catch (error) {
      this.logger.error('❌ Error processing webhook:', error);
      this.logger.error('Error stack:', error?.stack);
      // Do NOT swallow: rethrow so the controller responds 500 and Adapty
      // retries. This is safe now that crediting is idempotent (duplicate
      // retries are detected via the payments unique index and skipped).
      throw error;
    }
  }

  /** MySQL duplicate-key (ER_DUP_ENTRY / 1062) on payments.paymentIntentId. */
  private isDuplicatePayment(error: any): boolean {
    const code = error?.driverError?.code ?? error?.code;
    const errno = error?.driverError?.errno ?? error?.errno;
    return code === 'ER_DUP_ENTRY' || errno === 1062;
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
