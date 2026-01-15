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
import { AISettingsEntity } from './entities/ai-settings.entity';
import { PostModule } from 'src/post/post.module';
import { UserEntity } from 'src/user/entities/user.entity';
import { ActivityModule } from 'src/activity/activity.module';
import { NotificationModule } from 'src/notification/notification.module';
import { UserModule } from 'src/user/user.module';
import { ContestEntity } from 'src/contest/entity/contest.entity';
import { BullModule } from '@nestjs/bullmq';
import { ServiceTokenModule } from 'src/service-token/service-token.module';
import { PartnershipActivityEntity } from 'src/admin/entities/partnership-activity.entity';
import { PartnerUserLinkEntity } from 'src/admin/entities/partner-user-link.entity';
import { BullBoardModule } from '@bull-board/nestjs';
import { FalAiProcessor } from './processors/fal-ai.processor';
import { XRouterProcessor } from './processors/x-router.queue.processor';
import { AIProcessorMappingEntity } from './entities/ai-processor-mapping.entity';
import { PublicImageGenerationController } from './public-image-generation.controller';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'fal_ai' },
      { name: 'x_router' },
    ),
    BullBoardModule.forFeature(
      {
        name: 'fal_ai',
        adapter: BullMQAdapter,
      },
      {
        name: 'x_router',
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
      PartnershipActivityEntity,
      PartnerUserLinkEntity,
      AISettingsEntity,
      AIProcessorMappingEntity,
    ]),
    ActivityModule,
    NotificationModule,
    UserModule,
    ServiceTokenModule,
  ],
  providers: [
    ImageGenerationService,
    FalAiProcessor,
    XRouterProcessor,
  ],
  controllers: [ImageGenerationController, PublicImageGenerationController],
  exports: [ImageGenerationService],
})
export class ImageGenerationModule {}
