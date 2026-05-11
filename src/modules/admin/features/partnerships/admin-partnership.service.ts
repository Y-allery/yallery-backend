import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { CreatePartnershipDto } from 'src/modules/admin/dto/create-referral.dto';
import { PartnershipEntity } from 'src/modules/admin/entities/partner.entity';
import { PartnershipActivityEntity } from 'src/modules/admin/entities/partnership-activity.entity';
import { PartnerUserLinkEntity } from 'src/modules/admin/entities/partner-user-link.entity';
import { BranchLinkService } from './branch-link.service';

@Injectable()
export class AdminPartnershipService {
  constructor(
    @InjectRepository(PartnershipEntity)
    private readonly partnerShipRepo: Repository<PartnershipEntity>,
    @InjectRepository(PartnershipActivityEntity)
    private readonly partnerShipActivityRepository: Repository<PartnershipActivityEntity>,
    @InjectRepository(PartnerUserLinkEntity)
    private readonly partnerUserLinkRepository: Repository<PartnerUserLinkEntity>,
    private readonly branchLinkService: BranchLinkService,
  ) {}

  async createPartnership(data: CreatePartnershipDto) {
    const { partnerName, companyName, source, contestId } = data;
    const referralToken = uuidv4();

    const referralLink = await this.branchLinkService.createReferralLink({
      source,
      contestId,
      referralToken,
    });

    const partnership = this.partnerShipRepo.create({
      partnerName,
      companyName,
      source,
      referralLink,
      referralToken,
    });

    return await this.partnerShipRepo.save(partnership);
  }

  async getAllPartnerships() {
    return this.partnerShipRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  async getAllPartnershipsWithStats() {
    const partnerships = await this.partnerShipRepo.find({
      order: { createdAt: 'DESC' },
    });

    const results = [];

    for (const partner of partnerships) {
      const activities = await this.partnerShipActivityRepository
        .createQueryBuilder('activity')
        .select('activity.activity', 'activity')
        .addSelect('COUNT(*)', 'count')
        .where('activity.partnershipId = :id', { id: partner.id })
        .groupBy('activity.activity')
        .getRawMany();

      results.push({
        ...partner,
        activityStats: activities.reduce((acc, cur) => {
          acc[cur.activity] = parseInt(cur.count, 10);
          return acc;
        }, {}),
      });
    }

    return results;
  }

  async deletePartnership(
    partnershipId: number,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const partnership = await this.partnerShipRepo.findOne({
        where: { id: partnershipId },
      });
      if (!partnership) {
        return { success: false, message: 'Partnership not found' };
      }

      await this.partnerShipActivityRepository.delete({ partnershipId });
      await this.partnerUserLinkRepository.delete({ partnershipId });
      await this.partnerShipRepo.delete(partnershipId);

      return {
        success: true,
        message: 'Partnership and all related data deleted successfully',
      };
    } catch (error) {
      console.error('Error deleting partnership:', error);
      return { success: false, message: 'Failed to delete partnership' };
    }
  }
}
