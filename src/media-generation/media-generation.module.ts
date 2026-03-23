import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityModule } from 'src/activity/activity.module';
import { ContestEntity } from 'src/contest/entity/contest.entity';
import { ColorEntity } from 'src/image-generation/entities/color.entity';
import { AISettingsEntity } from 'src/image-generation/entities/ai-settings.entity';
import { NotificationModule } from 'src/notification/notification.module';
import { PostEntity } from 'src/post/entities/post.entity';
import { StyleEntity } from 'src/post/entities/style.entity';
import { UploadV2Module } from 'src/upload-v2/upload-v2.module';
import { ServiceTokenModule } from 'src/service-token/service-token.module';
import { TagEntity } from 'src/tag/entities/tag.entity';
import { UserEntity } from 'src/user/entities/user.entity';
import { UserModule } from 'src/user/user.module';
import { MediaAudioGenerationController } from './audio/media-audio-generation.controller';
import {
  MEDIA_AUDIO_GENERATION_QUEUE,
} from './audio/media-audio.constants';
import { MediaAudioGenerationProcessor } from './audio/media-audio-generation.processor';
import { MediaAudioGenerationService } from './audio/media-audio-generation.service';
import { MediaAudioPolicyService } from './audio/media-audio-policy.service';
import { MediaAudioPostService } from './audio/media-audio-post.service';
import { MediaAudioRequestBuilderService } from './audio/media-audio-request-builder.service';
import { MediaAudioSettingsService } from './audio/media-audio-settings.service';
import { FalAudioProvider } from './providers/fal/fal-audio.provider';
import { MediaGenerationDeliveryEntity } from './entities/media-generation-delivery.entity';
import { MediaGenerationRequestEntity } from './entities/media-generation-request.entity';
import { MediaImageGenerationController } from './image/media-image-generation.controller';
import { MEDIA_IMAGE_GENERATION_QUEUE } from './image/media-image.constants';
import { MediaImageGenerationProcessor } from './image/media-image-generation.processor';
import { MediaImageProfileResolverService } from './image/media-image-profile-resolver.service';
import { MediaImagePolicyService } from './image/media-image-policy.service';
import { MediaImagePromptComposerService } from './image/media-image-prompt-composer.service';
import { MediaImagePostService } from './image/media-image-post.service';
import { MediaImageRequestBuilderService } from './image/media-image-request-builder.service';
import { MediaImageGenerationService } from './image/media-image-generation.service';
import { MediaImageSettingsService } from './image/media-image-settings.service';
import { PublicMediaImageGenerationController } from './image/public-media-image-generation.controller';
import { RunpodProviderModule } from './providers/runpod/runpod-provider.module';
import { MediaGenerationCreditsService } from './shared/media-generation-credits.service';
import { MediaGenerationDeliveryService } from './shared/media-generation-delivery.service';
import { MediaGenerationContextService } from './shared/media-generation-context.service';
import { MediaGenerationTagSelectionService } from './shared/media-generation-tag-selection.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TagEntity,
      StyleEntity,
      ColorEntity,
      ContestEntity,
      UserEntity,
      PostEntity,
      AISettingsEntity,
      MediaGenerationRequestEntity,
      MediaGenerationDeliveryEntity,
    ]),
    BullModule.registerQueue({ name: MEDIA_IMAGE_GENERATION_QUEUE }),
    BullModule.registerQueue({ name: MEDIA_AUDIO_GENERATION_QUEUE }),
    BullBoardModule.forFeature({
      name: MEDIA_IMAGE_GENERATION_QUEUE,
      adapter: BullMQAdapter,
    }),
    BullBoardModule.forFeature({
      name: MEDIA_AUDIO_GENERATION_QUEUE,
      adapter: BullMQAdapter,
    }),
    UploadV2Module,
    ServiceTokenModule,
    RunpodProviderModule,
    NotificationModule,
    UserModule,
    ActivityModule,
  ],
  controllers: [
    MediaImageGenerationController,
    PublicMediaImageGenerationController,
    MediaAudioGenerationController,
  ],
  providers: [
    MediaGenerationContextService,
    MediaGenerationTagSelectionService,
    MediaGenerationCreditsService,
    MediaGenerationDeliveryService,
    FalAudioProvider,
    MediaAudioPolicyService,
    MediaAudioSettingsService,
    MediaAudioRequestBuilderService,
    MediaAudioPostService,
    MediaAudioGenerationService,
    MediaAudioGenerationProcessor,
    MediaImagePolicyService,
    MediaImagePromptComposerService,
    MediaImageProfileResolverService,
    MediaImageSettingsService,
    MediaImageRequestBuilderService,
    MediaImagePostService,
    MediaImageGenerationService,
    MediaImageGenerationProcessor,
  ],
  exports: [MediaImageGenerationService, MediaAudioGenerationService],
})
export class MediaGenerationModule {}
