import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaGenerationModule } from 'src/modules/media-generation/media-generation.module';
import { UploadModule } from 'src/modules/uploads/upload.module';
import { PartnerApiController } from './api/partner-api.controller';
import { PartnerPlaygroundController } from './api/partner-playground.controller';
import { PartnerAccountService } from './application/partner-account.service';
import { PartnerBillingService } from './application/partner-billing.service';
import { PartnerGenerationService } from './application/partner-generation.service';
import { PartnerAccountEntity } from './entities/partner-account.entity';
import { PartnerApiKeyEntity } from './entities/partner-api-key.entity';
import { PartnerApiUsageEntity } from './entities/partner-api-usage.entity';
import { PartnerBalanceTransactionEntity } from './entities/partner-balance-transaction.entity';
import { HostedMediaClient } from './infrastructure/hosted-media.client';
import { PartnerKeyGuard } from './infrastructure/partner-key.guard';
import { PartnerRateLimitGuard } from './infrastructure/partner-rate-limit.guard';
import { PartnerSessionGuard } from './infrastructure/partner-session.guard';
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
    ]),
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
    HostedMediaClient,
    PartnerKeyGuard,
    PartnerRateLimitGuard,
    PartnerSessionGuard,
  ],
  exports: [PartnerBillingService],
})
export class PartnerApiModule {}
