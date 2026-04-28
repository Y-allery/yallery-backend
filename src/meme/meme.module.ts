import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MemeEntity } from './entities/meme.entity';
import { MemeService } from './meme.service';
import { MemeController } from './meme.controller';
import { PostEntity } from 'src/post/entities/post.entity';
import { MediaAISettingsEntity } from 'src/media-generation/entities/media-ai-settings.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([MemeEntity, PostEntity, MediaAISettingsEntity]),
  ],
  controllers: [MemeController],
  providers: [MemeService],
  exports: [MemeService],
})
export class MemeModule {}
