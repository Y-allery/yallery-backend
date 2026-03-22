import { Module } from '@nestjs/common';
import { RunpodClient } from './runpod.client';
import { RunpodConfigService } from './runpod.config.service';
import { RunpodImageProvider } from './runpod-image.provider';

@Module({
  providers: [RunpodConfigService, RunpodClient, RunpodImageProvider],
  exports: [RunpodConfigService, RunpodClient, RunpodImageProvider],
})
export class RunpodProviderModule {}
