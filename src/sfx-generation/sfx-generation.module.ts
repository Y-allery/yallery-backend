import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { SfxAIEnum } from 'src/common/enums/ai.enum';
import { SfxGenerationService } from './sfx-generation.service';
import { SfxGenerationController } from './sfx-generation.controller';
import { MireloSfxVideoToVideoProcessor } from './processors/mirelo-sfx-video-to-video.processor';

import { NotificationModule } from 'src/notification/notification.module';
import { ServiceTokenModule } from 'src/service-token/service-token.module';
import { UploadModule } from 'src/upload/upload.module';
import { ActivityModule } from 'src/activity/activity.module';
import { UserModule } from 'src/user/user.module';

import { UserEntity } from 'src/user/entities/user.entity';
import { TagEntity } from 'src/tag/entities/tag.entity';
import { PostEntity } from 'src/post/entities/post.entity';
import { AISettingsEntity } from 'src/image-generation/entities/ai-settings.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([UserEntity, TagEntity, PostEntity, AISettingsEntity]),
    UserModule,
    ActivityModule,
    NotificationModule,
    UploadModule,
    ServiceTokenModule,
    BullModule.registerQueue({ name: SfxAIEnum.MIRELO_SFX_VIDEO_TO_VIDEO }),
    BullBoardModule.forFeature({
      name: SfxAIEnum.MIRELO_SFX_VIDEO_TO_VIDEO,
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [SfxGenerationController],
  providers: [SfxGenerationService, MireloSfxVideoToVideoProcessor],
  exports: [SfxGenerationService],
})
export class SfxGenerationModule {}

