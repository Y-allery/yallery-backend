import { TranslationsModule } from 'src/modules/translations/translations.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MemeEntity } from 'src/modules/memes/entities/meme.entity';
import { MemeService } from './meme.service';
import { MemeController } from './meme.controller';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { MediaAISettingsEntity } from 'src/modules/media-generation/persistence/entities/media-ai-settings.entity';

@Module({
  imports: [
    TranslationsModule,
    TypeOrmModule.forFeature([MemeEntity, PostEntity, MediaAISettingsEntity]),
  ],
  controllers: [MemeController],
  providers: [MemeService],
  exports: [MemeService],
})
export class MemeModule {}
