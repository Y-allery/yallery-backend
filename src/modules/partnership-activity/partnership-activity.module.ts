import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PartnershipActivityEntity } from 'src/modules/admin/entities/partnership-activity.entity';
import { PartnerUserLinkEntity } from 'src/modules/admin/entities/partner-user-link.entity';
import { PartnershipActivityLoggerService } from './partnership-activity-logger.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PartnershipActivityEntity,
      PartnerUserLinkEntity,
    ]),
  ],
  providers: [PartnershipActivityLoggerService],
  exports: [PartnershipActivityLoggerService],
})
export class PartnershipActivityModule {}
