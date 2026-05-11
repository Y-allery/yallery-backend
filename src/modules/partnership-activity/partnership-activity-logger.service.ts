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

      for (const link of links) {
        const exists = await this.partnershipActivityRepository.findOne({
          where: {
            partnershipId: link.partnershipId,
            userId,
            activity: normalizedActivity,
          },
        });

        if (exists) {
          continue;
        }

        const record = this.partnershipActivityRepository.create({
          partnershipId: link.partnershipId,
          userId,
          activity: normalizedActivity,
        });
        await this.partnershipActivityRepository.save(record);
      }
    } catch (error) {
      this.logger.error(
        `Failed to log partnership activity "${normalizedActivity}" for userId=${userId}: ${error?.message || error}`,
        error?.stack,
      );
    }
  }
}
