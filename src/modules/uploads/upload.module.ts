import { Module } from '@nestjs/common';
import { UploadService } from './upload.service';
import { SpacesStorageService } from './spaces-storage.service';
import { UploadController } from './upload.controller';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [UploadService, SpacesStorageService],
  controllers: [UploadController],
  exports: [UploadService],
})
export class UploadModule {}
