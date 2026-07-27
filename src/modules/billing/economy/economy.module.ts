import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RewardEntity } from 'src/modules/billing/rewards/entities/reward.entity';
import { MediaAISettingsEntity } from 'src/modules/media-generation/persistence/entities/media-ai-settings.entity';
import { MediaGenerationPricingService } from 'src/modules/media-generation/application/pricing/media-generation-pricing.service';
import { EconomyController } from './economy.controller';
import { EconomyService } from './economy.service';

/**
 * Read-only view over the points economy. The pricing service is provided
 * directly rather than importing MediaGenerationModule: it only needs the
 * ai-settings repository, and pulling the whole media module in would drag
 * every queue and processor along with it.
 */
@Module({
  imports: [TypeOrmModule.forFeature([RewardEntity, MediaAISettingsEntity])],
  controllers: [EconomyController],
  providers: [EconomyService, MediaGenerationPricingService],
  exports: [EconomyService],
})
export class EconomyModule {}
