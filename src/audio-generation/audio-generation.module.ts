import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { AISettingsEntity } from 'src/image-generation/entities/ai-settings.entity';
import { AudioGenerationController } from './audio-generation.controller';
import { AudioGenerationService } from './audio-generation.service';
import { AUDIO_GENERATION_QUEUE, AudioGenerationProcessor } from './processors/audio-generation.processor';
import { UserEntity } from 'src/user/entities/user.entity';
import { PostEntity } from 'src/post/entities/post.entity';
import { TagEntity } from 'src/tag/entities/tag.entity';
import { UploadModule } from 'src/upload/upload.module';
import { ServiceTokenModule } from 'src/service-token/service-token.module';
import { NotificationModule } from 'src/notification/notification.module';
import { ActivityModule } from 'src/activity/activity.module';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AISettingsEntity, UserEntity, PostEntity, TagEntity]),
    UploadModule,
    ServiceTokenModule,
    NotificationModule,
    ActivityModule,
    UserModule,
    BullModule.registerQueue({ name: AUDIO_GENERATION_QUEUE }),
    BullBoardModule.forFeature({ name: AUDIO_GENERATION_QUEUE, adapter: BullMQAdapter }),
  ],
  controllers: [AudioGenerationController],
  providers: [AudioGenerationService, AudioGenerationProcessor],
  exports: [AudioGenerationService],
})
export class AudioGenerationModule {}

