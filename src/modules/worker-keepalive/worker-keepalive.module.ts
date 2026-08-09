import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MediaGenerationModule } from '../media-generation/media-generation.module';
import { MediaTextVideoWorkflowEntity } from '../media-generation/persistence/entities/media-text-video-workflow.entity';
import { ProviderSettingsModule } from '../provider-settings/provider-settings.module';
import { WorkerKeepaliveService } from './worker-keepalive.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MediaTextVideoWorkflowEntity]),
    ProviderSettingsModule,
    MediaGenerationModule,
  ],
  providers: [WorkerKeepaliveService],
})
export class WorkerKeepaliveModule {}
