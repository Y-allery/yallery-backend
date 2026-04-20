import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class SocialDataService {
  private readonly logger = new Logger(SocialDataService.name);
  private readonly apiKey?: string;
  private readonly apiUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey =
      this.configService.get<string>('SOCIALDATA_API_KEY') ||
      this.configService.get<string>('TWEETSCOUT_API_KEY');
    this.apiUrl =
      this.configService.get<string>('SOCIALDATA_API_URL') ||
      'https://api.socialdata.tools';
  }

  async getUserProfile(usernameOrId: string) {
    return this.get(`/twitter/user/${encodeURIComponent(usernameOrId)}`);
  }

  async searchTweets(query: string, cursor?: string) {
    return this.get('/twitter/search', {
      query,
      ...(cursor ? { cursor } : {}),
    });
  }

  async verifyUserRetweeted(tweetId: string, userId: string) {
    return this.get(`/twitter/tweets/${tweetId}/retweeted_by/${userId}`);
  }

  private async get(path: string, params?: Record<string, string>) {
    if (!this.apiKey) {
      this.logger.error(
        '[socialdata] Missing API key. Set SOCIALDATA_API_KEY or TWEETSCOUT_API_KEY.',
      );
      throw new Error('SocialData API key is not configured');
    }

    const response = await axios.get(`${this.apiUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
      },
      params,
    });

    return response.data;
  }
}
