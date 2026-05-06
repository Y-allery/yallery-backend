import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PartnershipActivityEntity } from 'src/modules/admin/entities/partnership-activity.entity';
import { PartnerUserLinkEntity } from 'src/modules/admin/entities/partner-user-link.entity';
import { PartnershipEntity } from 'src/modules/admin/entities/partner.entity';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { TwitterApiIoService } from 'src/integrations/twitter-api-io/twitter-api-io.service';

@Injectable()
export class ReferralFlagService {
  private readonly logger = new Logger(ReferralFlagService.name);

  constructor(
    @InjectRepository(PartnershipEntity)
    private readonly partnerShipRepo: Repository<PartnershipEntity>,
    @InjectRepository(PartnershipActivityEntity)
    private readonly partnerShipActivityRepository: Repository<PartnershipActivityEntity>,
    @InjectRepository(PartnerUserLinkEntity)
    private readonly partnerUserLinkRepository: Repository<PartnerUserLinkEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly twitterApiIoService: TwitterApiIoService,
  ) {}

  async checkReferralFlag(params: {
    referralToken: string;
    partnerUserId: string;
    flag: string;
  }): Promise<{ status: string }> {
    const { referralToken, partnerUserId, flag } = params;

    const partnership = await this.partnerShipRepo.findOne({
      where: { referralToken },
    });

    if (!partnership) {
      return { status: 'false' };
    }

    const link = await this.partnerUserLinkRepository.findOne({
      where: {
        partnershipId: partnership.id,
        partnerUserId,
      },
    });

    if (!link || !link.userId) {
      return { status: 'false' };
    }

    const normalizedFlag = (flag || '').trim();
    const userIdNum = Number(link.userId);

    if (normalizedFlag === 'retweet') {
      return this.checkRetweetFlag(partnership.id, userIdNum);
    }

    const exists = await this.partnerShipActivityRepository
      .createQueryBuilder('pa')
      .where('pa.partnershipId = :pid', { pid: partnership.id })
      .andWhere('pa.userId = :uid', { uid: userIdNum })
      .andWhere('pa.activity = :flag', { flag: normalizedFlag })
      .limit(1)
      .getOne();

    return { status: !!exists ? 'true' : 'false' };
  }

  async setReferralFlag(params: {
    referralToken: string;
    partnerUserId: string;
    flag: string;
  }): Promise<{ status: boolean }> {
    const { referralToken, partnerUserId, flag } = params;
    const partnership = await this.partnerShipRepo.findOne({
      where: { referralToken },
    });
    if (!partnership) return { status: false };

    const link = await this.partnerUserLinkRepository.findOne({
      where: { partnershipId: partnership.id, partnerUserId },
    });
    if (!link || !link.userId) return { status: false };

    const exists = await this.partnerShipActivityRepository.findOne({
      where: {
        partnershipId: partnership.id,
        userId: link.userId,
        activity: flag,
      },
    });
    if (exists) return { status: true };

    const rec = this.partnerShipActivityRepository.create({
      partnershipId: partnership.id,
      userId: link.userId,
      activity: flag,
    });
    await this.partnerShipActivityRepository.save(rec);
    return { status: true };
  }

  private async checkRetweetFlag(
    partnershipId: number,
    userIdNum: number,
  ): Promise<{ status: string }> {
    try {
      const existingActivity = await this.partnerShipActivityRepository
        .createQueryBuilder('pa')
        .where('pa.partnershipId = :pid', { pid: partnershipId })
        .andWhere('pa.userId = :uid', { uid: userIdNum })
        .andWhere('pa.activity = :flag', { flag: 'retweet' })
        .limit(1)
        .getOne();

      if (existingActivity) {
        return { status: 'true' };
      }

      const user = await this.userRepository.findOne({
        where: { id: userIdNum },
      });

      if (!user || !user.twitterUsername) {
        return { status: 'false' };
      }

      const twitterUsername = user.twitterUsername.replace(/^@/, '');
      const retweetCheck = await this.checkRetweetWithTwitterApiIo(
        twitterUsername,
        partnershipId,
        userIdNum,
      );

      return { status: retweetCheck.retweet ? 'true' : 'false' };
    } catch (error) {
      this.logger.error(
        `[checkReferralFlag] Error checking retweet: ${error.message}`,
        error.stack,
      );
      return { status: 'false' };
    }
  }

  private async checkRetweetWithTwitterApiIo(
    userHandle: string,
    partnershipId: number,
    userId: number,
  ): Promise<{ retweet: boolean }> {
    const searchText = '@y_allery';
    const maxTweetsToCheck = 15;
    const normalizedUserHandle = userHandle.replace(/^@/, '');
    const query = `from:${normalizedUserHandle} ${searchText}`;
    let totalTweetsChecked = 0;
    let found = false;

    try {
      const response = await this.twitterApiIoService.searchTweets(
        query,
        'Latest',
      );
      const tweets = response?.tweets || [];

      for (const tweet of tweets) {
        totalTweetsChecked++;
        if (totalTweetsChecked > maxTweetsToCheck) {
          break;
        }

        const tweetText = tweet.full_text || tweet.text || '';
        if (tweetText.toLowerCase().includes(searchText.toLowerCase())) {
          found = true;
          break;
        }
      }

      if (found) {
        await this.saveRetweetActivity(partnershipId, userId);
      }

      return { retweet: found };
    } catch (error) {
      this.logger.error(
        `[checkRetweet] Error checking retweet for ${normalizedUserHandle}: ${error.message}`,
        error.stack,
      );
      return { retweet: false };
    }
  }

  private async saveRetweetActivity(partnershipId: number, userId: number) {
    const existingActivity = await this.partnerShipActivityRepository
      .createQueryBuilder('pa')
      .where('pa.partnershipId = :pid', { pid: partnershipId })
      .andWhere('pa.userId = :uid', { uid: userId })
      .andWhere('pa.activity = :flag', { flag: 'retweet' })
      .limit(1)
      .getOne();

    if (existingActivity) {
      return;
    }

    const activity = this.partnerShipActivityRepository.create({
      partnershipId,
      userId,
      activity: 'retweet',
    });
    await this.partnerShipActivityRepository.save(activity);
  }
}
