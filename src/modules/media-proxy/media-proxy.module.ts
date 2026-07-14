import { Module } from '@nestjs/common';
import { UploadModule } from 'src/modules/uploads/upload.module';
import { MediaProxyController } from './media-proxy.controller';
import { MediaProxyService } from './media-proxy.service';

@Module({
  imports: [UploadModule],
  providers: [MediaProxyService],
  controllers: [MediaProxyController],
})
export class MediaProxyModule {}
