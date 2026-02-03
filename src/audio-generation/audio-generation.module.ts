import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { AudioAIEnum } from 'src/common/enums/ai.enum';
import { AudioGenerationService } from './audio-generation.service';
import { AudioGenerationController } from './audio-generation.controller';
import { MireloAudioVideoToVideoProcessor } from './processors/mirelo-audio-video-to-video.processor';

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
    BullModule.registerQueue({ name: AudioAIEnum.MMAUDIO_V2 }),
    BullBoardModule.forFeature({
      name: AudioAIEnum.MMAUDIO_V2,
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [AudioGenerationController],
  providers: [AudioGenerationService, MireloAudioVideoToVideoProcessor],
  exports: [AudioGenerationService],
})
export class AudioGenerationModule {}

