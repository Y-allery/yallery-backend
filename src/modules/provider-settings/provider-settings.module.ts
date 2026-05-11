import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProviderRuntimeSettingEntity } from './entities/provider-runtime-setting.entity';
import { ProviderRuntimeConfigService } from './provider-runtime-config.service';
import { ProviderSettingsController } from './provider-settings.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ProviderRuntimeSettingEntity])],
  controllers: [ProviderSettingsController],
  providers: [ProviderRuntimeConfigService],
  exports: [ProviderRuntimeConfigService],
})
export class ProviderSettingsModule {}
