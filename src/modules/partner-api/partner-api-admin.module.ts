import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminPartnerApiController } from './api/admin-partner-api.controller';
import { PartnerApiKeyEntity } from './entities/partner-api-key.entity';
import { PartnerApiUsageEntity } from './entities/partner-api-usage.entity';

/**
 * Key minting and billing, kept out of PartnerApiModule so that the partner-facing
 * Swagger document — which is built by including that module — cannot grow an admin route
 * by accident.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PartnerApiKeyEntity, PartnerApiUsageEntity]),
  ],
  controllers: [AdminPartnerApiController],
})
export class PartnerApiAdminModule {}
