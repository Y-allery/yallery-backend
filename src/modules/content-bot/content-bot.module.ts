import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisService } from 'src/core/database/redis.service.connect';
import { TelegramService } from 'src/integrations/telegram/telegram.service';
import { MediaGenerationModule } from 'src/modules/media-generation/media-generation.module';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { TagEntity } from 'src/modules/catalog/tags/entities/tag.entity';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { MediaGenerationChargeEntity } from 'src/modules/media-generation/persistence/entities/media-generation-charge.entity';
import { ContentBotPlanEntity } from './entities/content-bot-plan.entity';
import { ContentBotService } from './content-bot.service';
import { ContentBotPromptService } from './content-bot-prompt.service';
import { ContentBotCron } from './content-bot.cron';
import { ContentBotController } from './content-bot.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ContentBotPlanEntity,
      PostEntity,
      TagEntity,
      UserEntity,
      MediaGenerationChargeEntity,
    ]),
    MediaGenerationModule,
  ],
  controllers: [ContentBotController],
  providers: [
    ContentBotService,
    ContentBotPromptService,
    ContentBotCron,
    TelegramService,
    RedisService,
  ],
})
export class ContentBotModule {}
