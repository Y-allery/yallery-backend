import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as AdmZip from 'adm-zip';
import { CsvExportService } from './csv-export.service';

@Injectable()
export class TwitterScoreExportService {
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly accountName: string;
  private readonly twitterScoreKey: string;
  private readonly twitterScoreUrl: string;
  private readonly twitterId: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly csvExportService: CsvExportService,
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

    const followingCsv = this.csvExportService.formatCsv(topFollowing || []);
    const followersCsv = this.csvExportService.formatCsv(topFollowers || []);
    const historyCsv = this.csvExportService.formatFollowersHistoryCsv(
      followersHistory || [],
    );
    const newFollowersCsv = this.csvExportService.formatCsv(
      newFollowers || [],
    );
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

  async getScore() {
    const response = await this.fetchFromApi(`/score/${this.accountName}`);
    return response.score;
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
}
