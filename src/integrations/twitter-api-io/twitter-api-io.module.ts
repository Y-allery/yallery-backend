import { Module } from '@nestjs/common';
import { TwitterApiIoService } from './twitter-api-io.service';

@Module({
  providers: [TwitterApiIoService],
  exports: [TwitterApiIoService],
})
export class TwitterApiIoModule {}
