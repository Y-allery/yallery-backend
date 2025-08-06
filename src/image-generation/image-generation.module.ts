import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { Module, forwardRef } from '@nestjs/common';
import { ImageGenerationService } from './image-generation.service';
import { ImageGenerationController } from './image-generation.controller';
import { UploadModule } from 'src/upload/upload.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostEntity } from 'src/post/entities/post.entity';
import { TagEntity } from 'src/tag/entities/tag.entity';
import { StyleEntity } from 'src/post/entities/style.entity';
import { ColorEntity } from './entities/color.entity';
import { PostModule } from 'src/post/post.module';
import { UserEntity } from 'src/user/entities/user.entity';
import { ActivityModule } from 'src/activity/activity.module';
import { NotificationModule } from 'src/notification/notification.module';
import { UserModule } from 'src/user/user.module';
import { ContestEntity } from 'src/contest/entity/contest.entity';
import { BullModule } from '@nestjs/bullmq';
import { ServiceTokenModule } from 'src/service-token/service-token.module';
import { BullBoardModule } from '@bull-board/nestjs';
import { SDXLProcessor } from './processors/realistic-vision.queue.processor';
import { AIEnum } from 'src/common/enums/ai.enum';
import { SD3Processor } from './processors/aura.queue.processor';
import { SDProcessor } from './processors/flux.queue.processor';
import { FluxProProcessor } from './processors/flux.pro.fine.tune';
import { BytedanceEditProcessor } from './processors/bytedance-edit.queue.processor';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: AIEnum.AURA_FLOW },
      { name: AIEnum.FLUX },
      { name: AIEnum.REALISTIC_VISION },
      { name: AIEnum.FLUX_PRO_FINE_TUNE },
      { name: AIEnum.BYTEDANCE_EDIT },
    ),
    BullBoardModule.forFeature(
      {
        name: AIEnum.AURA_FLOW,
        adapter: BullMQAdapter,
      },
      {
        name: AIEnum.FLUX,
        adapter: BullMQAdapter,
      },
      {
        name: AIEnum.REALISTIC_VISION,
        adapter: BullMQAdapter,
      },
      {
        name: AIEnum.FLUX_PRO_FINE_TUNE,
        adapter: BullMQAdapter,
      },
      {
        name: AIEnum.BYTEDANCE_EDIT,
        adapter: BullMQAdapter,
      },
    ),
    UploadModule,
    forwardRef(() => PostModule),
    TypeOrmModule.forFeature([
      PostEntity,
      TagEntity,
      StyleEntity,
      ColorEntity,
      UserEntity,
      ContestEntity,
    ]),
    ActivityModule,
    NotificationModule,
    UserModule,
    ServiceTokenModule,
  ],
  providers: [
    ImageGenerationService,
    SDXLProcessor,
    SD3Processor,
    SDProcessor,
    FluxProProcessor,
    BytedanceEditProcessor,
  ],
  controllers: [ImageGenerationController],
  exports: [ImageGenerationService],
})
export class ImageGenerationModule {}
