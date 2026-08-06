import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaGenerationModule } from 'src/modules/media-generation/media-generation.module';
import { UploadModule } from 'src/modules/uploads/upload.module';
import { PartnerApiController } from './api/partner-api.controller';
import { PartnerPlaygroundController } from './api/partner-playground.controller';
import { PartnerAccountService } from './application/partner-account.service';
import { PartnerBillingService } from './application/partner-billing.service';
import { PartnerGenerationService } from './application/partner-generation.service';
import { PartnerJobService } from './application/partner-job.service';
import { PartnerAccountEntity } from './entities/partner-account.entity';
import { PartnerApiKeyEntity } from './entities/partner-api-key.entity';
import { PartnerApiUsageEntity } from './entities/partner-api-usage.entity';
import { PartnerBalanceTransactionEntity } from './entities/partner-balance-transaction.entity';
import { PartnerJobEntity } from './entities/partner-job.entity';
import { HostedMediaClient } from './infrastructure/hosted-media.client';
import { PartnerCallbackClient } from './infrastructure/partner-callback.client';
import { PartnerKeyGuard } from './infrastructure/partner-key.guard';
import { PartnerRateLimitGuard } from './infrastructure/partner-rate-limit.guard';
import { PartnerSessionGuard } from './infrastructure/partner-session.guard';
import { PartnerGenerationProcessor } from './infrastructure/queues/partner-generation.processor';
import { PartnerWebhookProcessor } from './infrastructure/queues/partner-webhook.processor';
import {
  PARTNER_GENERATION_QUEUE,
  PARTNER_WEBHOOK_QUEUE,
} from './infrastructure/queues/partner.queues';
import { PartnerPortalController } from './api/partner-portal.controller';

/**
 * The public generation API sold to third parties.
 *
 * Self-contained on purpose: it shares the generation providers but none of the app's
 * user, points or post machinery, so nothing here can charge a Yallery account or create
 * a post, and the app's flows cannot be broken by a change made for a partner.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PartnerAccountEntity,
      PartnerApiKeyEntity,
      PartnerApiUsageEntity,
      PartnerBalanceTransactionEntity,
      PartnerJobEntity,
    ]),
    BullModule.registerQueue({ name: PARTNER_GENERATION_QUEUE }),
    BullModule.registerQueue({ name: PARTNER_WEBHOOK_QUEUE }),
    MediaGenerationModule,
    UploadModule,
  ],
  controllers: [
    PartnerApiController,
    PartnerPlaygroundController,
    PartnerPortalController,
  ],
  providers: [
    PartnerGenerationService,
    PartnerBillingService,
    PartnerAccountService,
    PartnerJobService,
    HostedMediaClient,
    PartnerCallbackClient,
    PartnerKeyGuard,
    PartnerRateLimitGuard,
    PartnerSessionGuard,
    PartnerGenerationProcessor,
    PartnerWebhookProcessor,
  ],
  exports: [PartnerBillingService],
})
export class PartnerApiModule {}
