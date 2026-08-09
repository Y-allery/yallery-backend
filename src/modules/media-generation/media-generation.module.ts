import { TranslationsModule } from 'src/modules/translations/translations.module';
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
import { UserProcessGenerationController } from 'src/modules/media-generation/api/user-process-generation.controller';
import { MediaGenerationTasksService } from 'src/modules/media-generation/application/tasks/media-generation-tasks.service';
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
import { KreaContentSafetyService } from 'src/modules/media-generation/application/content-safety/krea-content-safety.service';
import { PartnershipActivityModule } from 'src/modules/partnership-activity/partnership-activity.module';
import { OpsBotModule } from 'src/modules/ops-bot/ops-bot.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MediaTextVideoWorkflowEntity } from 'src/modules/media-generation/persistence/entities/media-text-video-workflow.entity';
import {
  TEXT_VIDEO_I2V_PROVIDER,
  TEXT_VIDEO_PRIVATE_ARTIFACT_STORE,
  TEXT_VIDEO_STILL_PROVIDER,
  TEXT_VIDEO_STILL_QC,
  TEXT_VIDEO_VIDEO_QC,
  TEXT_VIDEO_WORKFLOW_REPOSITORY,
  TEXT_VIDEO_WORKFLOW_STATE_MACHINE,
} from 'src/modules/media-generation/application/text-video/text-video-pipeline.ports';
import {
  TextVideoWorkflowRepository,
  TypeOrmTextVideoWorkflowRepository,
} from 'src/modules/media-generation/application/text-video/text-video-workflow.repository';
import { TextVideoWorkflowService } from 'src/modules/media-generation/application/text-video/text-video-workflow.service';
import { TextVideoCascadeRuntimeConfigService } from 'src/modules/media-generation/application/text-video/text-video-cascade-runtime-config.service';
import { VerbatimTextVideoPromptCompiler } from 'src/modules/media-generation/application/text-video/text-video-prompt-compiler';
import {
  DisabledTextVideoStillQc,
  DisabledTextVideoVideoQc,
} from 'src/modules/media-generation/application/text-video/text-video-quality-gates';
import {
  TechnicalTextVideoStillQc,
  TechnicalTextVideoVideoQc,
} from 'src/modules/media-generation/application/text-video/technical-text-video-qc';
import {
  TextVideoPipelineClock,
  TextVideoPipelineService,
} from 'src/modules/media-generation/application/text-video/text-video-pipeline.service';
import { PrunaPImageRuntimeClient } from 'src/modules/media-generation/infrastructure/providers/pruna/pruna-p-image-runtime.client';
import { PrunaStillCanonicalizer } from 'src/modules/media-generation/infrastructure/providers/pruna/pruna-still-canonicalizer';
import { PrunaPImageStillProvider } from 'src/modules/media-generation/infrastructure/providers/pruna/pruna-p-image-still.provider';
import { SpacesPrunaStillArtifactStore } from 'src/modules/media-generation/infrastructure/providers/pruna/spaces-pruna-still-artifact.store';
import { PrunaStillArtifactStore } from 'src/modules/media-generation/infrastructure/providers/pruna/pruna-still-artifact.store';
import { CascadeLtxI2VPayloadBuilder } from 'src/modules/media-generation/infrastructure/providers/runpod/cascade-ltx-i2v-payload.builder';
import { CascadeLtxI2vProvider } from 'src/modules/media-generation/infrastructure/providers/runpod/cascade-ltx-i2v.provider';
import { TextVideoArtifactReaperService } from 'src/modules/media-generation/application/text-video/text-video-artifact-reaper.service';
import { TextVideoFinalizationRecoveryService } from 'src/modules/media-generation/application/text-video/text-video-finalization-recovery.service';

const mediaGenerationQueueOptions = {
  streams: {
    events: {
      maxLen: 1000,
    },
  },
};

@Module({
  imports: [
    TranslationsModule,
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
      MediaTextVideoWorkflowEntity,
    ]),
    UploadModule,
    ContestModule,
    NotificationModule,
    UserActivityModule,
    PartnershipActivityModule,
    OpsBotModule,
  ],
  controllers: [MediaGenerationController, UserProcessGenerationController],
  providers: [
    GeneratedPostFactory,
    ContestMediaGenerationResolverService,
    MediaAISettingsService,
    MediaGenerationBalanceService,
    MediaGenerationEnqueueService,
    MediaGenerationTasksService,
    MediaGenerationExecutionService,
    MediaGenerationFinalizeService,
    MediaGenerationGuardsService,
    MediaGenerationPricingService,
    KreaContentSafetyService,
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
    TextVideoCascadeRuntimeConfigService,
    VerbatimTextVideoPromptCompiler,
    TextVideoPipelineClock,
    TextVideoPipelineService,
    TextVideoArtifactReaperService,
    TextVideoFinalizationRecoveryService,
    PrunaPImageRuntimeClient,
    PrunaStillCanonicalizer,
    SpacesPrunaStillArtifactStore,
    DisabledTextVideoStillQc,
    DisabledTextVideoVideoQc,
    TechnicalTextVideoStillQc,
    TechnicalTextVideoVideoQc,
    CascadeLtxI2VPayloadBuilder,
    CascadeLtxI2vProvider,
    {
      provide: TEXT_VIDEO_WORKFLOW_REPOSITORY,
      useFactory: (repository): TextVideoWorkflowRepository =>
        new TypeOrmTextVideoWorkflowRepository(repository),
      inject: [getRepositoryToken(MediaTextVideoWorkflowEntity)],
    },
    {
      provide: TEXT_VIDEO_WORKFLOW_STATE_MACHINE,
      useFactory: (repository: TextVideoWorkflowRepository) =>
        new TextVideoWorkflowService(repository),
      inject: [TEXT_VIDEO_WORKFLOW_REPOSITORY],
    },
    {
      provide: TEXT_VIDEO_PRIVATE_ARTIFACT_STORE,
      useExisting: SpacesPrunaStillArtifactStore,
    },
    {
      provide: TEXT_VIDEO_STILL_PROVIDER,
      useFactory: (
        client: PrunaPImageRuntimeClient,
        canonicalizer: PrunaStillCanonicalizer,
        artifactStore: PrunaStillArtifactStore,
      ) => new PrunaPImageStillProvider(client, canonicalizer, artifactStore),
      inject: [
        PrunaPImageRuntimeClient,
        PrunaStillCanonicalizer,
        TEXT_VIDEO_PRIVATE_ARTIFACT_STORE,
      ],
    },
    {
      provide: TEXT_VIDEO_STILL_QC,
      useExisting: TechnicalTextVideoStillQc,
    },
    {
      provide: TEXT_VIDEO_VIDEO_QC,
      useExisting: TechnicalTextVideoVideoQc,
    },
    {
      provide: TEXT_VIDEO_I2V_PROVIDER,
      useExisting: CascadeLtxI2vProvider,
    },
  ],
  exports: [
    MediaProviderRegistryService,
    MediaRouteResolverService,
    MediaGenerationEnqueueService,
    // Exported for the partner API, which calls a route synchronously rather than
    // through the queue: a partner's HTTP request is the job, and there is no post,
    // no points charge and no socket delivery to schedule around.
    RunpodOpenEndpointMediaProvider,
    // Exported for the worker-keepalive module: its ping is a raw endpoint job on
    // purpose — no workflow row, no points, no delivery.
    RunpodMediaClient,
  ],
})
export class MediaGenerationModule {}
