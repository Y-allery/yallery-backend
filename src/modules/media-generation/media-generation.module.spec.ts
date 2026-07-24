import { MODULE_METADATA } from '@nestjs/common/constants';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import {
  TEXT_VIDEO_I2V_PROVIDER,
  TEXT_VIDEO_PRIVATE_ARTIFACT_STORE,
  TEXT_VIDEO_STILL_PROVIDER,
  TEXT_VIDEO_STILL_QC,
  TEXT_VIDEO_VIDEO_QC,
  TEXT_VIDEO_WORKFLOW_REPOSITORY,
  TEXT_VIDEO_WORKFLOW_STATE_MACHINE,
} from './application/text-video/text-video-pipeline.ports';
import { TextVideoPipelineService } from './application/text-video/text-video-pipeline.service';
import { MediaTextVideoWorkflowEntity } from './persistence/entities/media-text-video-workflow.entity';
import { CascadeLtxI2vProvider } from './infrastructure/providers/runpod/cascade-ltx-i2v.provider';
import { CascadeLtxI2VPayloadBuilder } from './infrastructure/providers/runpod/cascade-ltx-i2v-payload.builder';
import { MediaGenerationModule } from './media-generation.module';
import { TextVideoFinalizationRecoveryService } from './application/text-video/text-video-finalization-recovery.service';
import { SpacesPrunaStillArtifactStore } from './infrastructure/providers/pruna/spaces-pruna-still-artifact.store';
import {
  TechnicalTextVideoStillQc,
  TechnicalTextVideoVideoQc,
} from './application/text-video/technical-text-video-qc';

describe('MediaGenerationModule cascade wiring', () => {
  const providers = Reflect.getMetadata(
    MODULE_METADATA.PROVIDERS,
    MediaGenerationModule,
  ) as Array<
    | Function
    | {
        provide?: unknown;
        useExisting?: unknown;
        useFactory?: Function;
        inject?: unknown[];
      }
  >;

  it('registers the durable pipeline and fixed I2V implementation', () => {
    expect(providers).toEqual(
      expect.arrayContaining([
        TextVideoPipelineService,
        TextVideoFinalizationRecoveryService,
        CascadeLtxI2VPayloadBuilder,
        CascadeLtxI2vProvider,
        SpacesPrunaStillArtifactStore,
      ]),
    );
    expect(providerFor(TEXT_VIDEO_I2V_PROVIDER)).toMatchObject({
      useExisting: CascadeLtxI2vProvider,
    });
    expect(providerFor(TEXT_VIDEO_STILL_PROVIDER)).toMatchObject({
      useFactory: expect.any(Function),
    });
    expect(providerFor(TEXT_VIDEO_STILL_QC)).toMatchObject({
      useExisting: TechnicalTextVideoStillQc,
    });
    expect(providerFor(TEXT_VIDEO_VIDEO_QC)).toMatchObject({
      useExisting: TechnicalTextVideoVideoQc,
    });
    expect(providerFor(TEXT_VIDEO_PRIVATE_ARTIFACT_STORE)).toMatchObject({
      useExisting: SpacesPrunaStillArtifactStore,
    });
  });

  it('binds the workflow repository to the TypeORM entity and state machine', () => {
    expect(providerFor(TEXT_VIDEO_WORKFLOW_REPOSITORY)).toMatchObject({
      useFactory: expect.any(Function),
      inject: [getRepositoryToken(MediaTextVideoWorkflowEntity)],
    });
    expect(providerFor(TEXT_VIDEO_WORKFLOW_STATE_MACHINE)).toMatchObject({
      useFactory: expect.any(Function),
      inject: [TEXT_VIDEO_WORKFLOW_REPOSITORY],
    });

    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      MediaGenerationModule,
    ) as Array<{
      module?: unknown;
      providers?: Array<{ provide?: unknown }>;
    }>;
    const typeOrmFeature = imports.find(
      (candidate) =>
        candidate?.module === TypeOrmModule &&
        candidate.providers?.some(
          (provider) =>
            provider.provide ===
            getRepositoryToken(MediaTextVideoWorkflowEntity),
        ),
    );
    expect(typeOrmFeature).toBeDefined();
  });

  function providerFor(token: unknown) {
    return providers.find(
      (provider) =>
        typeof provider === 'object' &&
        provider !== null &&
        provider.provide === token,
    );
  }
});
