import { Module } from '@nestjs/common';
import { ServiceTokenService } from './service-token.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiServiceToken } from './entities/service-token.entity';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  imports: [TypeOrmModule.forFeature([AiServiceToken]), NotificationModule],
  providers: [ServiceTokenService],
  exports: [ServiceTokenService],
})
export class ServiceTokenModule {}
