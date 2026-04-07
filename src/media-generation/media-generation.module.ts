import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContestEntity } from 'src/contest/entity/contest.entity';
import { AISettingsEntity } from 'src/image-generation/entities/ai-settings.entity';
import { ColorEntity } from 'src/image-generation/entities/color.entity';
import { NotificationModule } from 'src/notification/notification.module';
import { PostEntity } from 'src/post/entities/post.entity';
import { ServiceTokenModule } from 'src/service-token/service-token.module';
import { StyleEntity } from 'src/post/entities/style.entity';
import { TagEntity } from 'src/tag/entities/tag.entity';
import { FalAiMediaProvider } from './providers/fal/fal-ai-media.provider';
import { InternalMediaProvider } from './providers/internal/internal-media.provider';
import { RunpodOpenEndpointMediaProvider } from './providers/runpod/runpod-open-endpoint-media.provider';
import { XRouterMediaProvider } from './providers/x-router/x-router-media.provider';
import { MediaGenerationController } from './media-generation.controller';
import {
  MEDIA_AUDIO_GENERATION_QUEUE,
  MEDIA_IMAGE_EDIT_GENERATION_QUEUE,
  MEDIA_IMAGE_VIDEO_GENERATION_QUEUE,
  MEDIA_PROMPT_IMAGE_GENERATION_QUEUE,
  MEDIA_TEXT_VIDEO_GENERATION_QUEUE,
} from './constants/media-generation.queue';
import { MediaAudioProcessor } from './processors/media-audio.processor';
import { MediaEditImageProcessor } from './processors/media-edit-image.processor';
import { MediaImageVideoProcessor } from './processors/media-image-video.processor';
import { MediaPromptImageProcessor } from './processors/media-prompt-image.processor';
import { MediaTextVideoProcessor } from './processors/media-text-video.processor';
import { MediaGenerationService } from './media-generation.service';
import { ContestMediaGenerationResolverService } from './routing/contest-media-generation-resolver.service';
import { MediaProviderRegistryService } from './routing/media-provider-registry.service';
import { MediaRouteResolverService } from './routing/media-route-resolver.service';
import { UploadModule } from 'src/upload/upload.module';
import { UserEntity } from 'src/user/entities/user.entity';
import { MediaAISettingsEntity } from './entities/media-ai-settings.entity';
import { UserActivityModule } from 'src/user-activity/user-activity.module';
import { MediaTagResolverService } from './services/media-tag-resolver.service';
import { MediaPromptEnhancerService } from './services/media-prompt-enhancer.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: MEDIA_AUDIO_GENERATION_QUEUE }),
    BullModule.registerQueue({ name: MEDIA_IMAGE_EDIT_GENERATION_QUEUE }),
    BullModule.registerQueue({ name: MEDIA_IMAGE_VIDEO_GENERATION_QUEUE }),
    BullModule.registerQueue({ name: MEDIA_PROMPT_IMAGE_GENERATION_QUEUE }),
    BullModule.registerQueue({ name: MEDIA_TEXT_VIDEO_GENERATION_QUEUE }),
    TypeOrmModule.forFeature([
      AISettingsEntity,
      MediaAISettingsEntity,
      ColorEntity,
      StyleEntity,
      TagEntity,
      UserEntity,
      ContestEntity,
      PostEntity,
    ]),
    UploadModule,
    NotificationModule,
    ServiceTokenModule,
    UserActivityModule,
  ],
  controllers: [MediaGenerationController],
  providers: [
    MediaGenerationService,
    ContestMediaGenerationResolverService,
    MediaProviderRegistryService,
    MediaRouteResolverService,
    MediaTagResolverService,
    MediaPromptEnhancerService,
    MediaAudioProcessor,
    MediaEditImageProcessor,
    MediaImageVideoProcessor,
    MediaPromptImageProcessor,
    MediaTextVideoProcessor,
    FalAiMediaProvider,
    RunpodOpenEndpointMediaProvider,
    XRouterMediaProvider,
    InternalMediaProvider,
  ],
  exports: [
    MediaGenerationService,
    MediaProviderRegistryService,
    MediaRouteResolverService,
  ],
})
export class MediaGenerationModule {}
