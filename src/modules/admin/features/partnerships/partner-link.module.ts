import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PartnershipEntity } from 'src/modules/admin/entities/partner.entity';
import { PartnerUserLinkEntity } from 'src/modules/admin/entities/partner-user-link.entity';
import { PartnershipActivityEntity } from 'src/modules/admin/entities/partnership-activity.entity';
import { PartnerLinkService } from './partner-link.service';

/** Standalone so auth and user can share the linking logic without importing each other. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PartnershipEntity,
      PartnerUserLinkEntity,
      PartnershipActivityEntity,
    ]),
  ],
  providers: [PartnerLinkService],
  exports: [PartnerLinkService],
})
export class PartnerLinkModule {}
