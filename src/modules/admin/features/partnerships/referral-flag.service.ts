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

/**
 * 'not_found' means Twitter answered and the user has not posted; 'unavailable'
 * means the check could not run. Collapsing the two would let an API failure be
 * cached as a negative result.
 */
type RetweetStrategyOutcome = 'found' | 'not_found' | 'unavailable';

@Injectable()
export class ReferralFlagService {
  private readonly logger = new Logger(ReferralFlagService.name);

  // Negative retweet checks are not persisted, so without this cache every
  // "not retweeted yet" call re-runs the full Twitter cascade. Keyed by
  // partnershipId:userId; value is the expiry timestamp.
  //
  // The TTL is deliberately short: clients poll this endpoint while the user is
  // being asked to retweet, so a long TTL would keep answering "no" through the
  // exact window the check exists to observe. 45s still collapses a polling
  // client's fan-out ~15x while keeping the answer fresh enough to feel live.
  private readonly negativeRetweetCache = new Map<string, number>();
  private static readonly NEGATIVE_RETWEET_CACHE_TTL_MS = 45_000;

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

    // INSERT IGNORE against the unique (userId, partnershipId, activity) index:
    // a concurrent duplicate is a no-op rather than a 1062 error, so the
    // check-then-insert race cannot surface as a 500.
    await this.partnerShipActivityRepository
      .createQueryBuilder()
      .insert()
      .values({
        partnershipId: partnership.id,
        userId: link.userId,
        activity: flag,
      })
      .orIgnore()
      .updateEntity(false)
      .execute();
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

      if (this.hasFreshNegativeRetweetResult(partnershipId, userIdNum)) {
        return { status: 'false' };
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
      const strategies = [
        () => this.checkProfileTimelineForYallery(normalizedUserHandle),
        () => this.checkLastTweetsForYallery(normalizedUserHandle),
        () =>
          this.checkSearchFallbackForYallery(
            normalizedUserHandle,
            maxTweetsToCheck,
          ),
      ];

      let found = false;
      let allStrategiesCompleted = true;
      for (const runStrategy of strategies) {
        const outcome = await runStrategy();
        if (outcome === 'found') {
          found = true;
          break;
        }
        if (outcome === 'unavailable') {
          allStrategiesCompleted = false;
        }
      }

      if (found) {
        this.negativeRetweetCache.delete(
          this.retweetCacheKey(partnershipId, userId),
        );
        await this.saveRetweetActivity(partnershipId, userId);
      } else if (allStrategiesCompleted) {
        // Only remember a negative when every strategy actually reached Twitter.
        // A strategy that failed reports 'unavailable', not 'not_found', so a
        // transient outage cannot be cached as "this user did not retweet".
        this.rememberNegativeRetweetResult(partnershipId, userId);
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

  private retweetCacheKey(partnershipId: number, userId: number): string {
    return `${partnershipId}:${userId}`;
  }

  private hasFreshNegativeRetweetResult(
    partnershipId: number,
    userId: number,
  ): boolean {
    const key = this.retweetCacheKey(partnershipId, userId);
    const expiresAt = this.negativeRetweetCache.get(key);
    if (expiresAt === undefined) {
      return false;
    }
    if (expiresAt <= Date.now()) {
      this.negativeRetweetCache.delete(key);
      return false;
    }
    return true;
  }

  private rememberNegativeRetweetResult(
    partnershipId: number,
    userId: number,
  ): void {
    const now = Date.now();
    if (this.negativeRetweetCache.size > 10_000) {
      for (const [key, expiresAt] of this.negativeRetweetCache) {
        if (expiresAt <= now) this.negativeRetweetCache.delete(key);
      }
    }
    this.negativeRetweetCache.set(
      this.retweetCacheKey(partnershipId, userId),
      now + ReferralFlagService.NEGATIVE_RETWEET_CACHE_TTL_MS,
    );
  }

  private async checkProfileTimelineForYallery(
    userHandle: string,
  ): Promise<RetweetStrategyOutcome> {
    try {
      const profile = await this.twitterApiIoService.getUserProfile(userHandle);
      if (!profile.id) {
        return 'not_found';
      }

      const found = await this.findYalleryInPagedTweets((cursor) =>
        this.twitterApiIoService.getUserTimeline(profile.id, {
          cursor,
          includeReplies: true,
          includeParentTweet: false,
        }),
      );
      return found ? 'found' : 'not_found';
    } catch (error: any) {
      this.logger.warn(
        `[checkRetweet] Profile timeline check failed for ${userHandle}: ${error?.message || error}`,
      );
      return 'unavailable';
    }
  }

  private async checkLastTweetsForYallery(
    userHandle: string,
  ): Promise<RetweetStrategyOutcome> {
    try {
      const found = await this.findYalleryInPagedTweets((cursor) =>
        this.twitterApiIoService.getUserLastTweets(userHandle, {
          cursor,
          includeReplies: true,
        }),
      );
      return found ? 'found' : 'not_found';
    } catch (error: any) {
      this.logger.warn(
        `[checkRetweet] Last tweets check failed for ${userHandle}: ${error?.message || error}`,
      );
      return 'unavailable';
    }
  }

  private async checkSearchFallbackForYallery(
    userHandle: string,
    maxTweetsToCheck: number,
  ): Promise<RetweetStrategyOutcome> {
    try {
      // `from:` scopes the search to the user's own tweets — the same thing the
      // timeline strategies look for, and the only search form that finds them.
      // A bare `y_allery ${userHandle}` would instead match tweets whose text
      // mentions the handle, which a user's own retweet does not contain.
      const response = await this.twitterApiIoService.searchTweets(
        `from:${userHandle} y_allery`,
        'Latest',
      );
      const tweets = response?.tweets || [];

      return this.findYalleryMention(tweets.slice(0, maxTweetsToCheck))
        ? 'found'
        : 'not_found';
    } catch (error: any) {
      this.logger.warn(
        `[checkRetweet] Search fallback failed for ${userHandle}: ${error?.message || error}`,
      );
      return 'unavailable';
    }
  }

  private async findYalleryInPagedTweets(
    loadPage: (cursor?: string) => Promise<{
      tweets: NormalizedTwitterTweet[];
      has_next_page: boolean;
      next_cursor: string;
    }>,
  ): Promise<boolean> {
    const maxPages = 2;
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
    // INSERT IGNORE against the unique (userId, partnershipId, activity) index.
    // The previous check-then-insert could raise a duplicate-key error under
    // concurrent checks, which the caller turns into a wrong { retweet: false }.
    await this.partnerShipActivityRepository
      .createQueryBuilder()
      .insert()
      .values({ partnershipId, userId, activity: 'retweet' })
      .orIgnore()
      .updateEntity(false)
      .execute();
  }
}
