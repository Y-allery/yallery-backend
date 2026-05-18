import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export type TwitterApiIoQueryType = 'Latest' | 'Top';

export interface NormalizedTwitterUser {
  id: string;
  id_str: string;
  userName: string;
  screenName: string;
  name: string;
  url?: string;
  profilePicture?: string;
  description?: string;
  followers: number;
  following: number;
  followersCount: number;
  friendsCount: number;
  statusesCount: number;
  mediaCount: number;
  verified: boolean;
  isBlueVerified: boolean;
  verifiedType?: string;
  score: number;
  raw: any;
}

export interface NormalizedTwitterTweet {
  id: string;
  id_str: string;
  url?: string;
  text: string;
  full_text: string;
  retweetCount: number;
  retweet_count: number;
  replyCount: number;
  reply_count: number;
  likeCount: number;
  favorite_count: number;
  viewCount: number;
  view_count: number;
  quoteCount: number;
  createdAt?: string;
  author?: NormalizedTwitterUser;
  quoted_tweet?: any;
  retweeted_tweet?: any;
  entities?: any;
  raw: any;
}

@Injectable()
export class TwitterApiIoService {
  private readonly logger = new Logger(TwitterApiIoService.name);
  private readonly apiKey?: string;
  private readonly apiUrl: string;
  private readonly retweeterMaxPages: number;
  private readonly pageSize: number;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('TWITTERAPI_IO_API_KEY');
    this.apiUrl =
      this.configService.get<string>('TWITTERAPI_IO_API_URL') ||
      'https://api.twitterapi.io';
    this.retweeterMaxPages = this.readNumberConfig(
      'TWITTERAPI_IO_RETWEETER_MAX_PAGES',
      10,
    );
    this.pageSize = this.readNumberConfig('TWITTERAPI_IO_PAGE_SIZE', 200);
  }

  async searchTweets(
    query: string,
    queryType: TwitterApiIoQueryType = 'Latest',
    sinceTime?: number,
    untilTime?: number,
  ): Promise<{
    tweets: NormalizedTwitterTweet[];
    has_next_page: boolean;
    next_cursor: string;
    status?: string;
    message?: string;
  }> {
    const response = await this.get('/twitter/tweet/advanced_search', {
      query: this.addTimeBoundsToQuery(query, sinceTime, untilTime),
      queryType,
    });

    return {
      ...response,
      tweets: (response?.tweets || []).map((tweet: any) =>
        this.normalizeTweet(tweet),
      ),
      has_next_page: Boolean(response?.has_next_page),
      next_cursor: response?.next_cursor || '',
    };
  }

  async getUserProfile(username: string): Promise<NormalizedTwitterUser> {
    const response = await this.get('/twitter/user/info', {
      userName: this.normalizeUsername(username),
    });
    return this.normalizeUser(response?.data || response?.user || response);
  }

  async getUserTimeline(
    userId: string,
    options: {
      cursor?: string;
      includeReplies?: boolean;
      includeParentTweet?: boolean;
    } = {},
  ): Promise<{
    tweets: NormalizedTwitterTweet[];
    has_next_page: boolean;
    next_cursor: string;
    status?: string;
    message?: string;
  }> {
    const response = await this.get('/twitter/user/tweet_timeline', {
      userId,
      includeReplies: options.includeReplies ?? true,
      includeParentTweet: options.includeParentTweet ?? false,
      ...(options.cursor ? { cursor: options.cursor } : {}),
    });

    return this.normalizeTweetListResponse(response);
  }

  async getUserLastTweets(
    username: string,
    options: {
      userId?: string;
      cursor?: string;
      includeReplies?: boolean;
    } = {},
  ): Promise<{
    tweets: NormalizedTwitterTweet[];
    has_next_page: boolean;
    next_cursor: string;
    status?: string;
    message?: string;
  }> {
    const response = await this.get('/twitter/user/last_tweets', {
      ...(options.userId
        ? { userId: options.userId }
        : { userName: this.normalizeUsername(username) }),
      includeReplies: options.includeReplies ?? true,
      ...(options.cursor ? { cursor: options.cursor } : {}),
    });

    return this.normalizeTweetListResponse(response);
  }

  async getTweetRetweeters(
    tweetId: string,
    cursor?: string,
  ): Promise<{
    users: NormalizedTwitterUser[];
    has_next_page: boolean;
    next_cursor: string;
    status?: string;
    message?: string;
  }> {
    const response = await this.get('/twitter/tweet/retweeters', {
      tweetId,
      ...(cursor ? { cursor } : {}),
    });

    return {
      ...response,
      users: (response?.users || []).map((user: any) =>
        this.normalizeUser(user),
      ),
      has_next_page: Boolean(response?.has_next_page),
      next_cursor: response?.next_cursor || '',
    };
  }

  async getFollowers(
    username: string,
    cursor?: string,
    pageSize = this.pageSize,
  ): Promise<{
    followers: NormalizedTwitterUser[];
    has_next_page: boolean;
    next_cursor: string;
    status?: string;
    message?: string;
  }> {
    const response = await this.get('/twitter/user/followers', {
      userName: this.normalizeUsername(username),
      pageSize: this.clampPageSize(pageSize),
      ...(cursor ? { cursor } : {}),
    });

    return {
      ...response,
      followers: (response?.followers || []).map((user: any) =>
        this.normalizeUser(user),
      ),
      has_next_page: Boolean(response?.has_next_page),
      next_cursor: response?.next_cursor || '',
    };
  }

  async getFollowings(
    username: string,
    cursor?: string,
    pageSize = this.pageSize,
  ): Promise<{
    followings: NormalizedTwitterUser[];
    has_next_page: boolean;
    next_cursor: string;
    status?: string;
    message?: string;
  }> {
    const response = await this.get('/twitter/user/followings', {
      userName: this.normalizeUsername(username),
      pageSize: this.clampPageSize(pageSize),
      ...(cursor ? { cursor } : {}),
    });

    return {
      ...response,
      followings: (response?.followings || response?.users || []).map(
        (user: any) => this.normalizeUser(user),
      ),
      has_next_page: Boolean(response?.has_next_page),
      next_cursor: response?.next_cursor || '',
    };
  }

  async verifyUserRetweeted(
    tweetId: string,
    username: string,
  ): Promise<{ retweet: boolean; pagesChecked: number; userId?: string }> {
    const profile = await this.getUserProfile(username);
    const targetUserId = String(profile.id || '');
    const targetUsername = this.normalizeUsername(username).toLowerCase();
    let cursor: string | null = null;
    let pagesChecked = 0;

    while (pagesChecked < this.retweeterMaxPages) {
      const response = await this.getTweetRetweeters(tweetId, cursor || '');
      pagesChecked += 1;

      const match = response.users.some((user) => {
        const userIdMatches = targetUserId && String(user.id) === targetUserId;
        const usernameMatches =
          this.normalizeUsername(user.userName).toLowerCase() ===
          targetUsername;
        return userIdMatches || usernameMatches;
      });

      if (match) {
        return { retweet: true, pagesChecked, userId: targetUserId };
      }

      if (!response.users.length || !response.has_next_page) {
        break;
      }

      cursor = response.next_cursor || null;
      if (!cursor) {
        break;
      }
    }

    return { retweet: false, pagesChecked, userId: targetUserId };
  }

  calculateHeuristicScore(user: Partial<NormalizedTwitterUser> | any): number {
    const followers = this.toNumber(user?.followers ?? user?.followersCount);
    const following = this.toNumber(user?.following ?? user?.friendsCount);
    const statusesCount = this.toNumber(user?.statusesCount);
    const mediaCount = this.toNumber(user?.mediaCount);
    const verifiedBonus =
      user?.verified || user?.isBlueVerified || user?.verifiedType ? 25 : 0;
    const followerFollowingRatio = following > 0 ? followers / following : 50;

    return Math.round(
      Math.log10(followers + 1) * 35 +
        Math.log10(statusesCount + 1) * 10 +
        Math.log10(mediaCount + 1) * 5 +
        verifiedBonus +
        Math.min(followerFollowingRatio, 50),
    );
  }

  private async get(path: string, params?: Record<string, any>) {
    if (!this.apiKey) {
      this.logger.error(
        '[twitterapi.io] Missing API key. Set TWITTERAPI_IO_API_KEY.',
      );
      throw new Error('TwitterAPI.io API key is not configured');
    }

    const response = await axios.get(`${this.apiUrl}${path}`, {
      headers: {
        'X-API-Key': this.apiKey,
        Accept: 'application/json',
      },
      params,
    });

    if (response.data?.status === 'error') {
      throw new Error(
        response.data?.message || response.data?.msg || 'TwitterAPI.io error',
      );
    }

    return response.data;
  }

  private normalizeTweet(tweet: any): NormalizedTwitterTweet {
    const text = tweet?.text ?? tweet?.full_text ?? '';
    return {
      ...tweet,
      id: String(tweet?.id ?? tweet?.id_str ?? ''),
      id_str: String(tweet?.id_str ?? tweet?.id ?? ''),
      url: tweet?.url,
      text,
      full_text: text,
      retweetCount: this.toNumber(tweet?.retweetCount ?? tweet?.retweet_count),
      retweet_count: this.toNumber(
        tweet?.retweet_count ?? tweet?.retweetCount,
      ),
      replyCount: this.toNumber(tweet?.replyCount ?? tweet?.reply_count),
      reply_count: this.toNumber(tweet?.reply_count ?? tweet?.replyCount),
      likeCount: this.toNumber(tweet?.likeCount ?? tweet?.favorite_count),
      favorite_count: this.toNumber(
        tweet?.favorite_count ?? tweet?.likeCount,
      ),
      viewCount: this.toNumber(tweet?.viewCount ?? tweet?.view_count),
      view_count: this.toNumber(tweet?.view_count ?? tweet?.viewCount),
      quoteCount: this.toNumber(tweet?.quoteCount ?? tweet?.quote_count),
      createdAt: tweet?.createdAt ?? tweet?.created_at,
      author: tweet?.author ? this.normalizeUser(tweet.author) : undefined,
      raw: tweet,
    };
  }

  private normalizeTweetListResponse(response: any): {
    tweets: NormalizedTwitterTweet[];
    has_next_page: boolean;
    next_cursor: string;
    status?: string;
    message?: string;
  } {
    return {
      ...response,
      tweets: (response?.tweets || []).map((tweet: any) =>
        this.normalizeTweet(tweet),
      ),
      has_next_page: Boolean(response?.has_next_page),
      next_cursor: response?.next_cursor || '',
    };
  }

  private normalizeUser(user: any): NormalizedTwitterUser {
    const userName = this.normalizeUsername(
      user?.userName ?? user?.screen_name ?? user?.username ?? '',
    );
    const normalized: NormalizedTwitterUser = {
      ...user,
      id: String(user?.id ?? user?.id_str ?? ''),
      id_str: String(user?.id_str ?? user?.id ?? ''),
      userName,
      screenName: userName,
      name: user?.name || userName,
      url: user?.url,
      profilePicture: user?.profilePicture ?? user?.profile_image_url_https,
      description: user?.description || '',
      followers: this.toNumber(user?.followers ?? user?.followers_count),
      following: this.toNumber(user?.following ?? user?.friends_count),
      followersCount: this.toNumber(
        user?.followersCount ?? user?.followers ?? user?.followers_count,
      ),
      friendsCount: this.toNumber(
        user?.friendsCount ?? user?.following ?? user?.friends_count,
      ),
      statusesCount: this.toNumber(
        user?.statusesCount ?? user?.statuses_count,
      ),
      mediaCount: this.toNumber(user?.mediaCount ?? user?.media_count),
      verified: Boolean(
        user?.verified || user?.isBlueVerified || user?.verifiedType,
      ),
      isBlueVerified: Boolean(user?.isBlueVerified),
      verifiedType: user?.verifiedType,
      score: 0,
      raw: user,
    };
    normalized.score = this.calculateHeuristicScore(normalized);
    return normalized;
  }

  private addTimeBoundsToQuery(
    query: string,
    sinceTime?: number,
    untilTime?: number,
  ) {
    const parts = [query.trim()];
    if (sinceTime) parts.push(`since_time:${Math.floor(sinceTime)}`);
    if (untilTime) parts.push(`until_time:${Math.floor(untilTime)}`);
    return parts.join(' ');
  }

  private normalizeUsername(username: string) {
    return String(username || '').replace(/^@/, '').trim();
  }

  private clampPageSize(pageSize: number) {
    return Math.min(Math.max(this.toNumber(pageSize) || 200, 20), 200);
  }

  private readNumberConfig(key: string, defaultValue: number) {
    return this.toNumber(this.configService.get<string | number>(key)) || defaultValue;
  }

  private toNumber(value: any): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
