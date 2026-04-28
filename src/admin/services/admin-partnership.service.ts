import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { createObjectCsvStringifier } from 'csv-writer';
import * as AdmZip from 'adm-zip';
import * as https from 'https';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { CreatePartnershipDto } from '../dto/create.refferal.dto';
import {
  PartnershipEntity,
  PartnershipSource,
} from '../entities/partner.entity';
import { PartnershipActivityEntity } from '../entities/partnership-activity.entity';
import { PartnerUserLinkEntity } from '../entities/partner-user-link.entity';
import { UserEntity } from 'src/user/entities/user.entity';

@Injectable()
export class AdminPartnershipService {
  private readonly logger = new Logger(AdminPartnershipService.name);
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly accountName: string;
  private readonly twitterScoreKey: string;
  private readonly twitterScoreUrl: string;
  private readonly twitterId: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(PartnershipEntity)
    private readonly partnerShipRepo: Repository<PartnershipEntity>,
    @InjectRepository(PartnershipActivityEntity)
    private readonly partnerShipActivityRepository: Repository<PartnershipActivityEntity>,
    @InjectRepository(PartnerUserLinkEntity)
    private readonly partnerUserLinkRepository: Repository<PartnerUserLinkEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {
    this.apiKey = this.configService.get<string>('TWEETSCOUT_API_KEY');
    this.apiUrl = this.configService.get<string>(
      'TWEETSCOUT_API_URL',
      'https://api.tweetscout.io/v2',
    );
    this.accountName = this.configService.get<string>(
      'TWITTER_ACCOUNT_NAME',
      'y_allery',
    );
    this.twitterScoreKey = this.configService.get<string>(
      'TWITTER_SCORE_API_KEY',
    );
    this.twitterScoreUrl = this.configService.get<string>(
      'TWITTER_SCORE_API_URL',
      'https://twitterscore.io/api/v1',
    );
    this.twitterId = this.configService.get<string>('TWITTER_ACCOUNT_ID');
  }

  async getTopFollowersTwitterScore() {
    const url = `${this.twitterScoreUrl}/get_twitter_top_followers?api_key=${this.twitterScoreKey}&twitter_id=${this.twitterId}`;

    const res = await axios.get(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'NestJS TwitterScore Client',
      },
    });
    return res.data.data;
  }

  async getFollowersHistory() {
    const url = `${this.twitterScoreUrl}/followers_count_history?api_key=${this.twitterScoreKey}&twitter_id=${this.twitterId}&period=30`;
    const res = await axios.get(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'NestJS TwitterScore Client',
      },
    });
    return res.data.data;
  }

  async getNewFollowers() {
    const url = `${this.twitterScoreUrl}/get_twitter_top_followers?api_key=${this.twitterScoreKey}&twitter_id=${this.twitterId}&period=30`;
    const res = await axios.get(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'NestJS TwitterScore Client',
      },
    });
    return res.data.data;
  }

  async exportTwitterDataWithFollowers() {
    const topFollowing = await this.getTopFollowing();
    const score = await this.getScore();

    const topFollowers = await this.getTopFollowersTwitterScore();
    const followersHistory = await this.getFollowersHistory();
    const newFollowers = await this.getNewFollowers();

    const followingCsv = this.formatCsv(topFollowing || []);
    const followersCsv = this.formatCsv(topFollowers || []);
    const historyCsv = this.formatFollowersHistoryCsv(followersHistory || []);
    const newFollowersCsv = this.formatCsv(newFollowers || []);
    const archive = new AdmZip();

    archive.addFile('top-following.csv', Buffer.from(followingCsv, 'utf8'));
    archive.addFile('top-followers.csv', Buffer.from(followersCsv, 'utf8'));
    archive.addFile('followers-history.csv', Buffer.from(historyCsv, 'utf8'));
    archive.addFile(
      'new-followers-30d.csv',
      Buffer.from(newFollowersCsv, 'utf8'),
    );
    archive.addFile('score.txt', Buffer.from(`Score: ${score}`, 'utf8'));

    const zipBuffer = archive.toBuffer();
    return { zipBuffer };
  }

  async getTopFollowers() {
    return this.fetchFromApi(`/top-followers/${this.accountName}?from=db`);
  }

  async getTopFollowing() {
    return this.fetchFromApi(`/top-following/${this.accountName}`);
  }

  formatFollowersHistoryCsv(data: any[]): string {
    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'date', title: 'Date' },
        { id: 'followers', title: 'Followers Count' },
      ],
    });

    const records = data.map((item) => ({
      date: item.date,
      followers: item.followers_count,
    }));

    return (
      csvStringifier.getHeaderString() +
      csvStringifier.stringifyRecords(records)
    );
  }

  formatCsv(data: any[]): string {
    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'id', title: 'ID' },
        { id: 'name', title: 'Name' },
        { id: 'screenName', title: 'Screen Name' },
        { id: 'score', title: 'Score' },
        { id: 'followersCount', title: 'Followers Count' },
        { id: 'friendsCount', title: 'Friends Count' },
        { id: 'verified', title: 'Verified' },
        { id: 'description', title: 'Description' },
      ],
    });

    const records = data.map((item) => ({
      id: item.id,
      name: item.name,
      screenName: item.screeName,
      score: item.score,
      followersCount: item.followersCount,
      friendsCount: item.friendsCount,
      verified: item.verified,
      description: item.description,
    }));

    return (
      csvStringifier.getHeaderString() +
      csvStringifier.stringifyRecords(records)
    );
  }

  private async fetchFromApi(endpoint: string) {
    const response = await axios.get(`${this.apiUrl}${endpoint}`, {
      headers: {
        Accept: 'application/json',
        ApiKey: this.apiKey,
      },
    });
    return response.data;
  }

  async getScore() {
    const response = await this.fetchFromApi(`/score/${this.accountName}`);
    return response.score;
  }

  async createPartnership(data: CreatePartnershipDto) {
    const { partnerName, companyName, source, contestId } = data;
    const referralToken = uuidv4();

    let referralLink: string;
    if (source === PartnershipSource.MINI_APP) {
      referralLink = `https://t.me/yallery_bot?start=${referralToken}`;
    } else if (source === PartnershipSource.WEB_APP) {
      const baseUrl =
        this.configService.get<string>('WEB_APP_URL') ||
        'https://yallery.web.app';
      if (contestId && Number(contestId) > 0) {
        referralLink = `${baseUrl.replace(/\/$/, '')}/contests/${contestId}?ref=${referralToken}`;
      } else {
        referralLink = `${baseUrl.replace(/\/$/, '')}/?ref=${referralToken}`;
      }
    } else {
      const branchPayload: any = {
        branch_key: process.env.BRANCH_KEY,
        data: {
          $canonical_identifier: `referral/${referralToken}`,
          $desktop_url: `https://cuyab.app.link/rhHoT4tRzTb`,
          $ios_url: 'https://apps.apple.com/us/app/yallery/id6456609257',
          $android_url:
            'https://play.google.com/store/apps/details?id=app.yallery.y_allery_mobile_client&pli=1',
          referral_token: referralToken,
          $og_title: "Join me on Y'allery. Let's generate pictures together!",
          contest_id: contestId ? Number(contestId) : null,
        },
      };
      this.logger.log(
        'Branch.io payload: ' + JSON.stringify(branchPayload, null, 2),
      );
      const branchResponse = await axios.post(
        'https://api2.branch.io/v1/url',
        branchPayload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      referralLink = branchResponse.data.url;
    }

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
      try {
        const existingActivity = await this.partnerShipActivityRepository
          .createQueryBuilder('pa')
          .where('pa.partnershipId = :pid', { pid: partnership.id })
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
        const retweetCheck = await this.checkRetweet(
          twitterUsername,
          partnership.id,
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

  private async checkRetweet(
    userHandle: string,
    partnershipId: number,
    userId: number,
  ): Promise<{ retweet: boolean }> {
    const userLink = `https://twitter.com/${userHandle}`;
    const searchText = '@y_allery';
    const maxTweetsToCheck = 15;
    let cursor: string | null = null;
    let totalTweetsChecked = 0;
    let found = false;

    try {
      while (totalTweetsChecked < maxTweetsToCheck && !found) {
        const requestBody: any = {
          link: userLink,
        };

        if (cursor) {
          requestBody.cursor = cursor;
        }

        const options = {
          method: 'POST',
          hostname: 'api.tweetscout.io',
          path: '/v2/user-tweets',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ApiKey: this.apiKey,
          },
        };

        const response = await new Promise<any>((resolve, reject) => {
          const req = https.request(options, (res) => {
            const chunks: Uint8Array[] = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
              const responseBody = Buffer.concat(chunks).toString();
              try {
                const parsed = JSON.parse(responseBody);
                resolve(parsed);
              } catch (error) {
                this.logger.error(
                  `[checkRetweet] JSON parse error: ${error.message}`,
                  error.stack,
                );
                reject(error);
              }
            });
          });

          req.on('error', (e) => {
            this.logger.error(
              `[checkRetweet] Request error: ${e.message}`,
              e.stack,
            );
            reject(e);
          });

          req.write(JSON.stringify(requestBody));
          req.end();
        });

        const tweets = response?.tweets || [];

        for (const tweet of tweets) {
          totalTweetsChecked++;

          if (totalTweetsChecked > maxTweetsToCheck) {
            break;
          }

          const tweetText = tweet.full_text || '';
          const tweetId = tweet.id_str || 'unknown';

          if (tweetText.toLowerCase().includes(searchText.toLowerCase())) {
            this.logger.log(`[checkRetweet] FOUND POST WITH @yallery MENTION!`);
            this.logger.log(`[checkRetweet] Tweet ID: ${tweetId}`);
            this.logger.log(`[checkRetweet] Full Text: "${tweetText}"`);
            this.logger.log(
              `[checkRetweet] Tweet URL: https://twitter.com/${userHandle}/status/${tweetId}`,
            );
            found = true;
            break;
          }
        }

        if (found) {
          break;
        }

        cursor = response?.next_cursor || null;
        if (!cursor || tweets.length === 0) {
          break;
        }
      }

      if (found) {
        try {
          const existingActivity = await this.partnerShipActivityRepository
            .createQueryBuilder('pa')
            .where('pa.partnershipId = :pid', { pid: partnershipId })
            .andWhere('pa.userId = :uid', { uid: userId })
            .andWhere('pa.activity = :flag', { flag: 'retweet' })
            .limit(1)
            .getOne();

          if (!existingActivity) {
            const activity = this.partnerShipActivityRepository.create({
              partnershipId,
              userId,
              activity: 'retweet',
            });
            await this.partnerShipActivityRepository.save(activity);
          }
        } catch (error) {
          this.logger.error(
            `[checkRetweet] Error saving to database: ${error.message}`,
            error.stack,
          );
        }
      }

      return { retweet: found };
    } catch (error) {
      this.logger.error(
        `[checkRetweet] Error checking retweet for ${userHandle}: ${error.message}`,
        error.stack,
      );
      return { retweet: false };
    }
  }
}
