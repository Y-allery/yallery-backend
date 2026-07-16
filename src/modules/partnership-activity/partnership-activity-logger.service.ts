import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PartnershipActivityEntity } from 'src/modules/admin/entities/partnership-activity.entity';
import { PartnerUserLinkEntity } from 'src/modules/admin/entities/partner-user-link.entity';
import { Repository } from 'typeorm';

@Injectable()
export class PartnershipActivityLoggerService {
  private readonly logger = new Logger(PartnershipActivityLoggerService.name);

  constructor(
    @InjectRepository(PartnerUserLinkEntity)
    private readonly partnerUserLinkRepository: Repository<PartnerUserLinkEntity>,
    @InjectRepository(PartnershipActivityEntity)
    private readonly partnershipActivityRepository: Repository<PartnershipActivityEntity>,
  ) {}

  async logOnceForUser(userId: number, activity: string): Promise<void> {
    const normalizedActivity = activity?.trim();

    if (!userId || !normalizedActivity) {
      this.logger.warn(
        `Skipped partnership activity logging: userId=${userId}, activity=${activity}`,
      );
      return;
    }

    try {
      const links = await this.partnerUserLinkRepository.find({
        where: { userId },
      });

      if (links.length === 0) {
        return;
      }

      // Single bulk INSERT IGNORE; the unique (userId, partnershipId,
      // activity) index makes already-logged rows no-ops without a
      // read-before-write round trip per link.
      await this.partnershipActivityRepository
        .createQueryBuilder()
        .insert()
        .values(
          links.map((link) => ({
            partnershipId: link.partnershipId,
            userId,
            activity: normalizedActivity,
          })),
        )
        .orIgnore()
        .updateEntity(false)
        .execute();
    } catch (error) {
      this.logger.error(
        `Failed to log partnership activity "${normalizedActivity}" for userId=${userId}: ${error?.message || error}`,
        error?.stack,
      );
    }
  }
}
