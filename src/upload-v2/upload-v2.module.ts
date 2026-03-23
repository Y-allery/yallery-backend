import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UploadV2Service } from './upload-v2.service';

@Module({
  imports: [ConfigModule],
  providers: [UploadV2Service],
  exports: [UploadV2Service],
})
export class UploadV2Module {}
