import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaGenerationModule } from 'src/modules/media-generation/media-generation.module';
import { PartnerApiController } from './api/partner-api.controller';
import { PartnerPlaygroundController } from './api/partner-playground.controller';
import { PartnerGenerationService } from './application/partner-generation.service';
import { PartnerApiKeyEntity } from './entities/partner-api-key.entity';
import { PartnerApiUsageEntity } from './entities/partner-api-usage.entity';
import { HostedMediaClient } from './infrastructure/hosted-media.client';
import { PartnerKeyGuard } from './infrastructure/partner-key.guard';
import { PartnerRateLimitGuard } from './infrastructure/partner-rate-limit.guard';

/**
 * The public generation API sold to third parties.
 *
 * Self-contained on purpose: it shares the generation providers but none of the app's
 * user, points or post machinery, so nothing here can charge a Yallery account or create
 * a post, and the app's flows cannot be broken by a change made for a partner.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PartnerApiKeyEntity, PartnerApiUsageEntity]),
    MediaGenerationModule,
  ],
  controllers: [PartnerApiController, PartnerPlaygroundController],
  providers: [
    PartnerGenerationService,
    HostedMediaClient,
    PartnerKeyGuard,
    PartnerRateLimitGuard,
  ],
})
export class PartnerApiModule {}
