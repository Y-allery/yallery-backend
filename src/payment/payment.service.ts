import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../user/user.service';
import { PaymentEntity } from './entities/payment.entity';
import { NotificationGateway } from 'src/notification/notification.gateway';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private productPointsMap: { [key: string]: number } = {
    '5000yeps': 5000,
    '15000yeps': 15000,
    '30000yeps': 30000,
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  async processWebhook(webhookData: Buffer): Promise<void> {
    try {
      const dataString = webhookData.toString('utf-8');
      this.logger.log(`📥 Received webhook data: ${dataString.substring(0, 200)}...`);

      const parsedData = JSON.parse(dataString);

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
          break;

        default:
          this.logger.warn(`⚠️ Unhandled event type: ${eventType}`);
      }
    } catch (error) {
      this.logger.error('❌ Error processing webhook:', error);
      this.logger.error('Error stack:', error.stack);
    }
  }

  private getPointsForProduct(productId: string): number | null {
    return this.productPointsMap[productId] || null;
  }
}
