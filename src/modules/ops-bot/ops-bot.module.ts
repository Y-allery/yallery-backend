import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { MediaGenerationChargeEntity } from 'src/modules/media-generation/persistence/entities/media-generation-charge.entity';
import { MediaAISettingsEntity } from 'src/modules/media-generation/persistence/entities/media-ai-settings.entity';
import { PaymentEntity } from 'src/modules/billing/payments/entities/payment.entity';
import { RewardModule } from 'src/modules/billing/rewards/reward.module';
import { TelegramService } from 'src/integrations/telegram/telegram.service';
import { AIUsageMetricsCollector } from 'src/modules/admin/features/metrics/collectors/ai-usage.collector';
import { OpsBotService } from './ops-bot.service';
import { OpsBotController } from './ops-bot.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PostEntity,
      MediaGenerationChargeEntity,
      MediaAISettingsEntity,
      PaymentEntity,
    ]),
    RewardModule,
  ],
  controllers: [OpsBotController],
  providers: [OpsBotService, TelegramService, AIUsageMetricsCollector],
  exports: [OpsBotService],
})
export class OpsBotModule {}
