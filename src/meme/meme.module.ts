import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { MemeEntity } from './entities/meme.entity';
import { MemeService } from './meme.service';
import { MemeController } from './meme.controller';
import { MemeGenerationProcessor } from './processors/meme-generation.processor';
import { MEME_GENERATION_QUEUE } from './meme.constants';
import { NotificationModule } from 'src/notification/notification.module';
import { UploadModule } from 'src/upload/upload.module';
import { UserModule } from 'src/user/user.module';
import { PostEntity } from 'src/post/entities/post.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([MemeEntity, PostEntity]),
    NotificationModule,
    UploadModule,
    UserModule,
    BullModule.registerQueue({ name: MEME_GENERATION_QUEUE }),
    BullBoardModule.forFeature({
      name: MEME_GENERATION_QUEUE,
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [MemeController],
  providers: [MemeService, MemeGenerationProcessor],
  exports: [MemeService],
})
export class MemeModule {}
