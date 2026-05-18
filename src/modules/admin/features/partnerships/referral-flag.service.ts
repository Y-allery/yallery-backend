import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PartnershipActivityEntity } from 'src/modules/admin/entities/partnership-activity.entity';
import { PartnerUserLinkEntity } from 'src/modules/admin/entities/partner-user-link.entity';
import { PartnershipEntity } from 'src/modules/admin/entities/partner.entity';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import {
  NormalizedTwitterTweet,
  TwitterApiIoService,
} from 'src/integrations/twitter-api-io/twitter-api-io.service';

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
    const maxTweetsToCheck = 15;
    const normalizedUserHandle = userHandle.replace(/^@/, '');

    try {
      const found =
        (await this.checkProfileTimelineForYallery(normalizedUserHandle)) ||
        (await this.checkLastTweetsForYallery(normalizedUserHandle)) ||
        (await this.checkSearchFallbackForYallery(
          normalizedUserHandle,
          maxTweetsToCheck,
        ));

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

  private async checkProfileTimelineForYallery(
    userHandle: string,
  ): Promise<boolean> {
    try {
      const profile = await this.twitterApiIoService.getUserProfile(userHandle);
      if (!profile.id) {
        return false;
      }

      return this.findYalleryInPagedTweets((cursor) =>
        this.twitterApiIoService.getUserTimeline(profile.id, {
          cursor,
          includeReplies: true,
          includeParentTweet: false,
        }),
      );
    } catch (error: any) {
      this.logger.warn(
        `[checkRetweet] Profile timeline check failed for ${userHandle}: ${error?.message || error}`,
      );
      return false;
    }
  }

  private async checkLastTweetsForYallery(userHandle: string): Promise<boolean> {
    try {
      return this.findYalleryInPagedTweets((cursor) =>
        this.twitterApiIoService.getUserLastTweets(userHandle, {
          cursor,
          includeReplies: true,
        }),
      );
    } catch (error: any) {
      this.logger.warn(
        `[checkRetweet] Last tweets check failed for ${userHandle}: ${error?.message || error}`,
      );
      return false;
    }
  }

  private async checkSearchFallbackForYallery(
    userHandle: string,
    maxTweetsToCheck: number,
  ): Promise<boolean> {
    const queries = [
      `from:${userHandle} y_allery`,
      `from:${userHandle} @y_allery`,
      `y_allery ${userHandle}`,
    ];

    for (const query of queries) {
      const response = await this.twitterApiIoService.searchTweets(
        query,
        'Latest',
      );
      const tweets = response?.tweets || [];

      if (this.findYalleryMention(tweets.slice(0, maxTweetsToCheck))) {
        return true;
      }
    }

    return false;
  }

  private async findYalleryInPagedTweets(
    loadPage: (cursor?: string) => Promise<{
      tweets: NormalizedTwitterTweet[];
      has_next_page: boolean;
      next_cursor: string;
    }>,
  ): Promise<boolean> {
    const maxPages = 5;
    let cursor = '';

    for (let page = 0; page < maxPages; page++) {
      const response = await loadPage(cursor);

      if (this.findYalleryMention(response.tweets || [])) {
        return true;
      }

      if (!response.has_next_page || !response.next_cursor) {
        break;
      }

      cursor = response.next_cursor;
    }

    return false;
  }

  private findYalleryMention(tweets: NormalizedTwitterTweet[]): boolean {
    return tweets.some((tweet) =>
      this.collectTweetTexts(tweet).some((text) =>
        this.normalizeTwitterText(text).includes('y_allery'),
      ),
    );
  }

  private collectTweetTexts(tweet: NormalizedTwitterTweet): string[] {
    const quotedTweet = tweet.quoted_tweet;
    const retweetedTweet = tweet.retweeted_tweet;

    return [
      tweet.full_text,
      tweet.text,
      tweet.url,
      tweet.author?.userName,
      quotedTweet?.full_text,
      quotedTweet?.text,
      quotedTweet?.url,
      quotedTweet?.author?.userName,
      retweetedTweet?.full_text,
      retweetedTweet?.text,
      retweetedTweet?.url,
      retweetedTweet?.author?.userName,
      ...(tweet.entities?.user_mentions || []).map(
        (mention: any) => mention?.screen_name,
      ),
      ...(quotedTweet?.entities?.user_mentions || []).map(
        (mention: any) => mention?.screen_name,
      ),
      ...(retweetedTweet?.entities?.user_mentions || []).map(
        (mention: any) => mention?.screen_name,
      ),
    ].filter((value): value is string => Boolean(value));
  }

  private normalizeTwitterText(value: string): string {
    return value.trim().toLowerCase().replace(/^@/, '');
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
