import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as AdmZip from 'adm-zip';
import { CsvExportService } from './csv-export.service';
import { TwitterApiIoService } from 'src/integrations/twitter-api-io/twitter-api-io.service';

@Injectable()
export class TwitterApiIoExportService {
  private readonly accountName: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly csvExportService: CsvExportService,
    private readonly twitterApiIoService: TwitterApiIoService,
  ) {
    this.accountName = this.configService.get<string>(
      'TWITTER_ACCOUNT_NAME',
      'y_allery',
    );
  }

  async getTopFollowersFromTwitterApiIo() {
    const response = await this.twitterApiIoService.getFollowers(
      this.accountName,
    );
    return response.followers;
  }

  async getFollowersHistory() {
    const profile = await this.twitterApiIoService.getUserProfile(
      this.accountName,
    );
    return [
      {
        date: new Date().toISOString().slice(0, 10),
        followers_count: profile.followersCount,
      },
    ];
  }

  async getNewFollowers() {
    const response = await this.twitterApiIoService.getFollowers(
      this.accountName,
    );
    return response.followers;
  }

  async exportTwitterDataWithFollowers() {
    const topFollowing = await this.getTopFollowing();
    const score = await this.getScore();

    const topFollowers = await this.getTopFollowersFromTwitterApiIo();
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
    const response = await this.twitterApiIoService.getFollowers(
      this.accountName,
    );
    return response.followers;
  }

  async getTopFollowing() {
    const response = await this.twitterApiIoService.getFollowings(
      this.accountName,
    );
    return response.followings;
  }

  async getScore() {
    const profile = await this.twitterApiIoService.getUserProfile(
      this.accountName,
    );
    return profile.score;
  }
}
