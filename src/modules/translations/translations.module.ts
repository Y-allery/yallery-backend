import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContestEntity } from 'src/modules/contests/entity/contest.entity';
import { TagEntity } from 'src/modules/catalog/tags/entities/tag.entity';
import { StyleEntity } from 'src/modules/posts/entities/style.entity';
import { MemeEntity } from 'src/modules/memes/entities/meme.entity';
import { RewardEntity } from 'src/modules/billing/rewards/entities/reward.entity';
import { ProviderSettingsModule } from 'src/modules/provider-settings/provider-settings.module';
import { ContentTranslationEntity } from './entities/content-translation.entity';
import { ContentTranslationService } from './content-translation.service';
import { ContentTranslationQueue } from './content-translation.queue';
import {
  CONTENT_TRANSLATION_QUEUE,
  ContentTranslationWorker,
} from './content-translation.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ContentTranslationEntity,
      ContestEntity,
      TagEntity,
      StyleEntity,
      MemeEntity,
      RewardEntity,
    ]),
    BullModule.registerQueue({ name: CONTENT_TRANSLATION_QUEUE }),
    ProviderSettingsModule,
  ],
  providers: [
    ContentTranslationService,
    ContentTranslationQueue,
    ContentTranslationWorker,
  ],
  exports: [ContentTranslationService, ContentTranslationQueue],
})
export class TranslationsModule {}
