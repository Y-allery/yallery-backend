import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MediaGenerationModule } from '../media-generation/media-generation.module';
import { PartnerJobEntity } from '../partner-api/entities/partner-job.entity';
import { ProviderSettingsModule } from '../provider-settings/provider-settings.module';
import { WorkerKeepaliveService } from './worker-keepalive.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PartnerJobEntity]),
    ProviderSettingsModule,
    MediaGenerationModule,
  ],
  providers: [WorkerKeepaliveService],
})
export class WorkerKeepaliveModule {}
