import { Injectable } from '@nestjs/common';
import { CreateContestDto } from './dto/create-contest.dto';
import { ContestService } from 'src/contest/contest.service';
import { ContestRunDto } from './dto/contest.run.dto';
import { BlockUserDto } from './dto/block.user.dto';
import { UserService } from 'src/user/user.service';
import { BlockPostDto } from './dto/block.post.dto';
import { PostService } from 'src/post/post.service';
import { GetTopPostDto } from './dto/get-top-post.dto';
import { SetContestWinnerDto } from './dto/set.contest.winner.dto';
import { GetAllReportsDto } from './dto/get.report.post.dto';
import { PaginatioDto } from 'src/common/dto/pagination.dto';
import { TagService } from 'src/tag/tag.service';
import { CreateTagDto } from 'src/tag/dto/create.tag.dto';
import { UpdateTagDto } from 'src/tag/dto/update.tag.dto';
import { UpdateContestDto } from 'src/contest/dto/update.contest.dto';
import { CreateStyleDto } from 'src/post/dto/create.style.dto';
import { ActivityService } from 'src/activity/activity.service';
import { ContestStatusEnum } from 'src/contest/types/contest.status.enum';
import { createObjectCsvStringifier } from 'csv-writer';
import axios from 'axios';
import * as AdmZip from 'adm-zip';
import { CreatePartnershipDto } from './dto/create.refferal.dto';
import { v4 as uuidv4 } from 'uuid';
import {
  PartnershipEntity,
  PartnershipSource,
} from './entities/partner.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { PartnershipActivityEntity } from './entities/partnership-activity.entity';

@Injectable()
export class AdminService {
  private readonly apiKey = '07f21f9a-74c5-4991-91f0-030e62380d6c';
  private readonly apiUrl = 'https://api.tweetscout.io/v2';
  private readonly accountName = 'y_allery';
  private twitterScoreKey = '5ca9113c28c1cc2fe04ab7803244efc9';
  private twitterScoreUrl = 'https://twitterscore.io/api/v1';
  private readonly twitterId = '1912510240014364675';
  constructor(
    private readonly contestService: ContestService,
    private readonly userService: UserService,
    private readonly postService: PostService,
    private readonly tagService: TagService,
    private readonly activityService: ActivityService,
    @InjectRepository(PartnershipEntity)
    private readonly partnerShipRepo: Repository<PartnershipEntity>,
    @InjectRepository(PartnershipActivityEntity)
    private readonly partnerShipActivityRepository: Repository<PartnershipActivityEntity>,
  ) {}
  async createAdminContest(data: CreateContestDto) {
    return this.contestService.createAdminContest(data);
  }

  async forceContestRun(data: ContestRunDto) {
    return this.contestService.forceContestRun(data);
  }

  async blockUser({ user_id }: BlockUserDto) {
    await this.userService.deleteUserAccount(user_id);
    return {
      success: true,
      message: 'User blocked succesfully',
    };
  }

  async unblockUser({ user_id }: BlockUserDto) {
    await this.userService.unblockUserAccount(user_id);
    return {
      success: true,
      message: 'User unblocked successfully',
    };
  }

  async unblockPost({ post_id }: BlockPostDto) {
    await this.postService.unblockPost(post_id);
    return {
      success: true,
      message: 'Post unblocked successfully',
    };
  }

  async blockPost({ post_id }: BlockPostDto) {
    const response = await this.postService.blockPost(post_id);
    return response;
  }

  async getPendingReviewContests() {
    return this.contestService.getPendingReviewPosts();
  }

  async getTopContestPost(data: GetTopPostDto) {
    return this.contestService.getTopContestPost(data);
  }

  async setContestWinner(data: SetContestWinnerDto) {
    return this.contestService.setContestWinner(data);
  }

  async rejectContestWinner(data: SetContestWinnerDto) {
    return this.contestService.rejectContestWinner(data);
  }

  async getReportPosts(data: GetAllReportsDto) {
    return this.postService.getReportPosts(data);
  }

  async getUsers(getUsersDto: PaginatioDto) {
    return this.userService.getAllUsers(getUsersDto);
  }

  async getAllTags() {
    return this.tagService.findAll();
  }

  async createTag(data: CreateTagDto) {
    return this.tagService.create(data);
  }

  async updateTag(id: number, updateTagDto: UpdateTagDto) {
    return this.tagService.update(id, updateTagDto);
  }

  async deleteTag(id: number) {
    return this.tagService.delete(id);
  }

  async findAllContests(status: ContestStatusEnum) {
    return this.contestService.findContestsByStatus(status);
  }

  async updateContest(id: number, updateContestDto: UpdateContestDto) {
    return this.contestService.updateContest(id, updateContestDto);
  }

  async deleteContest(id: number) {
    return this.contestService.deleteContest(id);
  }

  async createStyle(dto: CreateStyleDto) {
    return this.postService.createStyle(dto);
  }

  async findAllStyles() {
    return this.postService.findAllStyles();
  }

  async findStyleById(id: number) {
    return this.postService.findStyleById(id);
  }

  async updateStyle(id: number, dto: CreateStyleDto) {
    return this.postService.updateStyle(id, dto);
  }

  async deleteStyle(id: number) {
    return this.postService.deleteStyle(id);
  }

  async getPostsByContestSortedByLikes() {
    return this.contestService.getTopPostForEachContest();
  }

  async getAdminActiveNottifications(dto: PaginatioDto) {
    return this.activityService.getAdminActiveNotifications(dto);
  }

  async getAdminArchiveNottifications(dto: PaginatioDto) {
    return this.activityService.getAdminArchiveNotifications(dto);
  }

  async getPostById(postId: number): Promise<any> {
    return this.postService.getPostById(postId);
  }

  async deleteReport(
    reportId: number,
  ): Promise<{ success: boolean; message: string }> {
    return this.postService.deleteReport(reportId);
  }

  async rejectComplaint(
    complaintId: number,
  ): Promise<{ success: boolean; message: string }> {
    return this.postService.deleteReport(complaintId);
  }

  async getTopFollowersTwitterScore() {
    const url = `${this.twitterScoreUrl}/get_twitter_top_followers?api_key=${this.twitterScoreKey}&twitter_id=${this.twitterId}`;

    const res = await axios.get(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'NestJS TwitterScore Client', // ← Додано критично важливий заголовок
      },
    });
    return res.data.data;
  }

  async getFollowersHistory() {
    const url = `${this.twitterScoreUrl}/followers_count_history?api_key=${this.twitterScoreKey}&twitter_id=${this.twitterId}&period=30`;
    const res = await axios.get(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'NestJS TwitterScore Client', // ← критично важливо
      },
    });
    return res.data.data;
  }

  async getNewFollowers() {
    const url = `${this.twitterScoreUrl}/get_twitter_top_followers?api_key=${this.twitterScoreKey}&twitter_id=${this.twitterId}&period=30`;
    const res = await axios.get(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'NestJS TwitterScore Client', // ← критично важливо
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
    const { partnerName, companyName, source } = data;
    const referralToken = uuidv4();

    let referralLink: string;
    if (source === PartnershipSource.MINI_APP) {
      referralLink = `https://t.me/yallery_bot?start=${referralToken}`;
    } else {
      const branchPayload = {
        branch_key: process.env.BRANCH_KEY,
        data: {
          $canonical_identifier: `referral/${referralToken}`,
          $desktop_url: `https://cuyab.app.link/rhHoT4tRzTb`,
          $ios_url: 'https://apps.apple.com/us/app/yallery/id6456609257',
          $android_url:
            'https://play.google.com/store/apps/details?id=app.yallery.y_allery_mobile_client&pli=1',
          referral_token: referralToken,
          $og_title: 'Join me on Y’allery. Let’s generate pictures together!',
        },
      };
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
}
