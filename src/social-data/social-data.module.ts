import { Module } from '@nestjs/common';
import { SocialDataService } from './social-data.service';

@Module({
  providers: [SocialDataService],
  exports: [SocialDataService],
})
export class SocialDataModule {}
