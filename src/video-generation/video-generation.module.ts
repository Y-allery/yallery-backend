import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { VideoAIEnum } from 'src/common/enums/ai.enum';
import { VideoGenerationService } from './video-generation.service';
import { BytyDanceProcessor } from './processors/byty-dance.processor';
import { NotificationModule } from 'src/notification/notification.module';
import { ServiceTokenModule } from 'src/service-token/service-token.module';
import { UploadModule } from 'src/upload/upload.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from 'src/user/entities/user.entity';
import { UserModule } from 'src/user/user.module';
import { ActivityModule } from 'src/activity/activity.module';
import { TagEntity } from 'src/tag/entities/tag.entity';
import { PostEntity } from 'src/post/entities/post.entity';
import { AISettingsEntity } from 'src/image-generation/entities/ai-settings.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, TagEntity, PostEntity, AISettingsEntity]),
    UserModule,
    ActivityModule,
    NotificationModule,
    UploadModule,
    ServiceTokenModule,
    NotificationModule,
    BullModule.registerQueue({ name: VideoAIEnum.BYTY_DANCE }),
    BullBoardModule.forFeature({
      name: VideoAIEnum.BYTY_DANCE,
      adapter: BullMQAdapter,
    }),
  ],
  providers: [VideoGenerationService, BytyDanceProcessor],
  exports: [VideoGenerationService],
})
export class VideoGenerationModule {}
