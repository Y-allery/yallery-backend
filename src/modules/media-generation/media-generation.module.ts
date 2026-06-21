import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContestEntity } from 'src/modules/contests/entity/contest.entity';
import { ContestModule } from 'src/modules/contests/contest.module';
import { ContestFlowMetadataEntity } from 'src/modules/contests/entity/contest-flow-metadata.entity';
import { NotificationModule } from 'src/modules/notifications/notification.module';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { StyleEntity } from 'src/modules/posts/entities/style.entity';
import { TagEntity } from 'src/modules/catalog/tags/entities/tag.entity';
import { MemeEntity } from 'src/modules/memes/entities/meme.entity';
import { RunpodEndpointResolver } from 'src/modules/media-generation/infrastructure/providers/runpod/runpod-endpoint.resolver';
import { RunpodMediaClient } from 'src/modules/media-generation/infrastructure/providers/runpod/runpod-media.client';
import { RunpodOpenEndpointMediaProvider } from 'src/modules/media-generation/infrastructure/providers/runpod/runpod-open-endpoint-media.provider';
import { RunpodOutputExtractor } from 'src/modules/media-generation/infrastructure/providers/runpod/runpod-output.extractor';
import { RunpodPayloadBuilder } from 'src/modules/media-generation/infrastructure/providers/runpod/runpod-payload.builder';
import { RunpodTimeoutPolicyService } from 'src/modules/media-generation/infrastructure/providers/runpod/runpod-timeout-policy.service';
import { MediaGenerationController } from 'src/modules/media-generation/api/media-generation.controller';
import {
  MEDIA_AUDIO_GENERATION_QUEUE,
  MEDIA_IMAGE_EDIT_GENERATION_QUEUE,
  MEDIA_IMAGE_VIDEO_GENERATION_QUEUE,
  MEDIA_MEME_GENERATION_QUEUE,
  MEDIA_PROMPT_IMAGE_GENERATION_QUEUE,
  MEDIA_TEXT_VIDEO_GENERATION_QUEUE,
} from 'src/modules/media-generation/infrastructure/queues/constants/media-generation.queue';
import { MediaAudioProcessor } from 'src/modules/media-generation/infrastructure/queues/processors/media-audio.processor';
import { MediaEditImageProcessor } from 'src/modules/media-generation/infrastructure/queues/processors/media-edit-image.processor';
import { MediaImageVideoProcessor } from 'src/modules/media-generation/infrastructure/queues/processors/media-image-video.processor';
import { MediaMemeProcessor } from 'src/modules/media-generation/infrastructure/queues/processors/media-meme.processor';
import { MediaPromptImageProcessor } from 'src/modules/media-generation/infrastructure/queues/processors/media-prompt-image.processor';
import { MediaTextVideoProcessor } from 'src/modules/media-generation/infrastructure/queues/processors/media-text-video.processor';
import { ContestMediaGenerationResolverService } from 'src/modules/media-generation/application/contest/contest-media-generation-resolver.service';
import { MediaProviderRegistryService } from 'src/modules/media-generation/infrastructure/routing/media-provider-registry.service';
import { MediaRouteResolverService } from 'src/modules/media-generation/infrastructure/routing/media-route-resolver.service';
import { UploadModule } from 'src/modules/uploads/upload.module';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { MediaAISettingsEntity } from 'src/modules/media-generation/persistence/entities/media-ai-settings.entity';
import { UserActivityModule } from 'src/modules/engagement/user-activity/user-activity.module';
import { MediaTagResolverService } from 'src/modules/media-generation/infrastructure/tagging/media-tag-resolver.service';
import { MediaPromptEnhancerService } from 'src/modules/media-generation/application/prompt-enhancement/media-prompt-enhancer.service';
import { ColorEntity } from 'src/modules/media-generation/persistence/entities/color.entity';
import { MediaGenerationChargeEntity } from 'src/modules/media-generation/persistence/entities/media-generation-charge.entity';
import { AIFinetuneEntity } from 'src/modules/admin/entities/ai-finetune.entity';
import { GeneratedPostFactory } from 'src/modules/media-generation/infrastructure/posts/generated-post.factory';
import { MediaAISettingsService } from 'src/modules/media-generation/application/ai-settings/media-ai-settings.service';
import { MediaGenerationBalanceService } from 'src/modules/media-generation/application/balance/media-generation-balance.service';
import { MediaGenerationEnqueueService } from 'src/modules/media-generation/application/enqueue/media-generation-enqueue.service';
import { MediaGenerationExecutionService } from 'src/modules/media-generation/application/execution/media-generation-execution.service';
import { MediaGenerationFinalizeService } from 'src/modules/media-generation/application/finalize/media-generation-finalize.service';
import { MediaGenerationGuardsService } from 'src/modules/media-generation/application/guards/media-generation-guards.service';
import { MediaGenerationPricingService } from 'src/modules/media-generation/application/pricing/media-generation-pricing.service';
import { PartnershipActivityModule } from 'src/modules/partnership-activity/partnership-activity.module';

const mediaGenerationQueueOptions = {
  streams: {
    events: {
      maxLen: 1000,
    },
  },
};

@Module({
  imports: [
    BullModule.registerQueue({
      name: MEDIA_AUDIO_GENERATION_QUEUE,
      ...mediaGenerationQueueOptions,
    }),
    BullModule.registerQueue({
      name: MEDIA_IMAGE_EDIT_GENERATION_QUEUE,
      ...mediaGenerationQueueOptions,
    }),
    BullModule.registerQueue({
      name: MEDIA_IMAGE_VIDEO_GENERATION_QUEUE,
      ...mediaGenerationQueueOptions,
    }),
    BullModule.registerQueue({
      name: MEDIA_MEME_GENERATION_QUEUE,
      ...mediaGenerationQueueOptions,
    }),
    BullModule.registerQueue({
      name: MEDIA_PROMPT_IMAGE_GENERATION_QUEUE,
      ...mediaGenerationQueueOptions,
    }),
    BullModule.registerQueue({
      name: MEDIA_TEXT_VIDEO_GENERATION_QUEUE,
      ...mediaGenerationQueueOptions,
    }),
    TypeOrmModule.forFeature([
      MediaAISettingsEntity,
      ColorEntity,
      MediaGenerationChargeEntity,
      StyleEntity,
      TagEntity,
      UserEntity,
      AIFinetuneEntity,
      ContestEntity,
      ContestFlowMetadataEntity,
      PostEntity,
      MemeEntity,
    ]),
    UploadModule,
    ContestModule,
    NotificationModule,
    UserActivityModule,
    PartnershipActivityModule,
  ],
  controllers: [MediaGenerationController],
  providers: [
    GeneratedPostFactory,
    ContestMediaGenerationResolverService,
    MediaAISettingsService,
    MediaGenerationBalanceService,
    MediaGenerationEnqueueService,
    MediaGenerationExecutionService,
    MediaGenerationFinalizeService,
    MediaGenerationGuardsService,
    MediaGenerationPricingService,
    MediaProviderRegistryService,
    MediaRouteResolverService,
    MediaTagResolverService,
    MediaPromptEnhancerService,
    MediaAudioProcessor,
    MediaEditImageProcessor,
    MediaImageVideoProcessor,
    MediaMemeProcessor,
    MediaPromptImageProcessor,
    MediaTextVideoProcessor,
    RunpodEndpointResolver,
    RunpodMediaClient,
    RunpodOpenEndpointMediaProvider,
    RunpodOutputExtractor,
    RunpodPayloadBuilder,
    RunpodTimeoutPolicyService,
  ],
  exports: [MediaProviderRegistryService, MediaRouteResolverService],
})
export class MediaGenerationModule {}
