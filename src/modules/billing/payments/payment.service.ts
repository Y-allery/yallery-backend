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
import { OpsBotService } from 'src/modules/ops-bot/ops-bot.service';

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
    private readonly opsBotService: OpsBotService,
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
        await this.opsBotService.notifyBackendError(
          `Adapty webhook missing profileId or eventType (profileId=${profileId}, eventType=${eventType}) — this ACKs 200, Adapty will not retry.`,
          'payment:missing-profile-or-event',
        );
        return;
      }

      const user = await this.userService.findById(profileId);

      if (!user) {
        this.logger.warn(`⚠️ User not found with id: ${profileId}`);
        await this.opsBotService.notifyBackendError(
          `Adapty webhook for unknown user id ${profileId} (event ${eventType}) — purchase silently dropped, this ACKs 200, Adapty will not retry.`,
          'payment:user-not-found',
        );
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
            await this.opsBotService.notifyBackendError(
              `Adapty webhook purchase for user ${profileId} has no vendor_product_id — silently dropped, this ACKs 200, Adapty will not retry.`,
              'payment:missing-product-id',
            );
            return;
          }

          const pointsToAdd = await this.getPointsForProduct(productId);

          if (pointsToAdd === null) {
            this.logger.error(`❌ Unknown productId: ${productId}`);
            await this.opsBotService.notifyBackendError(
              `Adapty webhook purchase for user ${profileId}: unrecognized productId "${productId}" — silently dropped, this ACKs 200, Adapty will not retry. Add it to productPointsMap if it's a real SKU.`,
              'payment:unknown-product-id',
            );
            return;
          }

          // Adapty nests transaction/price/environment fields under
          // event_properties, NOT top-level on the webhook body (confirmed
          // against a real captured payload, 2026-06-17 prod log) — reading
          // the top-level path here meant paymentIntentId was ALWAYS null
          // (silently rejecting every purchase past the idempotency guard
          // below), isTest never detected a real sandbox purchase, and amount
          // always fell back to the points value instead of the real price.
          // Top-level keys are kept as a defensive fallback only.
          const isTest =
            String(
              eventProperties?.environment ?? parsedData.environment ?? '',
            ).toLowerCase() === 'sandbox' ||
            eventProperties?.is_sandbox === true ||
            parsedData.is_sandbox === true ||
            parsedData.test === true;

          // Idempotency key: a stable provider id is REQUIRED. Without one we
          // cannot dedupe Adapty's at-least-once retries, so we refuse to credit
          // rather than risk minting points twice. (paymentIntentId is a UNIQUE
          // column but allows multiple NULLs, so null-id events would bypass
          // dedup entirely — hence the hard reject here.)
          const paymentIntentId =
            eventProperties?.transaction_id ||
            eventProperties?.original_transaction_id ||
            parsedData.transaction_id ||
            parsedData.payment_intent_id ||
            null;
          if (!paymentIntentId) {
            this.logger.error(
              `❌ Purchase for user ${profileId} (product ${productId}) has no transaction id — refusing to credit without an idempotency key`,
            );
            await this.opsBotService.notifyBackendError(
              `Adapty webhook purchase for user ${profileId} (product ${productId}) has no transaction id — refused to credit, silently dropped, this ACKs 200, Adapty will not retry.`,
              'payment:no-transaction-id',
            );
            return;
          }

          // price_local is the amount in `currency`; price_usd is Adapty's
          // USD-normalized figure and must be paired with 'USD' explicitly
          // (not eventProperties.currency, which names the LOCAL currency).
          // Legacy price/amount keys are a defensive fallback only — never
          // fall back to pointsToAdd for a money field: that silently stored
          // e.g. "5000 UAH" for a real 249.99 UAH purchase for months.
          const priceLocal = Number(
            eventProperties?.price_local ??
              eventProperties?.price ??
              eventProperties?.amount,
          );
          const priceUsd = Number(eventProperties?.price_usd);
          let amount: number;
          let currency: string;
          if (Number.isFinite(priceLocal)) {
            amount = priceLocal;
            currency = eventProperties?.currency || 'USD';
          } else if (Number.isFinite(priceUsd)) {
            amount = priceUsd;
            currency = 'USD';
          } else {
            this.logger.error(
              `❌ No parsable price for transaction ${paymentIntentId} (product ${productId}) — storing amount=0, investigate this payload`,
            );
            await this.opsBotService.notifyBackendError(
              `Adapty webhook purchase for user ${profileId} (product ${productId}, transaction ${paymentIntentId}) has no parsable price_local/price_usd — points WILL still be credited, but amount was stored as 0. Check the raw payload shape.`,
              'payment:unparseable-price',
            );
            amount = 0;
            currency = eventProperties?.currency || 'USD';
          }

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
                isTest,
                pointsCredited: pointsToAdd,
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
          await this.opsBotService.notifyBackendError(
            `Adapty webhook: unhandled event type "${eventType}" for user ${profileId} — silently ignored, this ACKs 200, Adapty will not retry. If this represents a real purchase (e.g. a subscription event), it needs a handler.`,
            `payment:unhandled-event-type:${eventType}`,
          );
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
