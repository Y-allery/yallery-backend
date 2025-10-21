import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateContestDto } from './dto/create-contest.dto';
import { ContestService } from 'src/contest/contest.service';
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
import { Repository, Not } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { PartnershipActivityEntity } from './entities/partnership-activity.entity';
import { PartnerUserLinkEntity } from './entities/partner-user-link.entity';
import { PostEntity } from 'src/post/entities/post.entity';
import { UserEntity } from 'src/user/entities/user.entity';
import * as https from 'https';

@Injectable()
export class AdminService {
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly accountName: string;
  private readonly twitterScoreKey: string;
  private readonly twitterScoreUrl: string;
  private readonly twitterId: string;
  constructor(
    private readonly configService: ConfigService,
    private readonly contestService: ContestService,
    private readonly userService: UserService,
    private readonly postService: PostService,
    private readonly tagService: TagService,
    private readonly activityService: ActivityService,
    @InjectRepository(PartnershipEntity)
    private readonly partnerShipRepo: Repository<PartnershipEntity>,
    @InjectRepository(PartnershipActivityEntity)
    private readonly partnerShipActivityRepository: Repository<PartnershipActivityEntity>,
    @InjectRepository(PartnerUserLinkEntity)
    private readonly partnerUserLinkRepository: Repository<PartnerUserLinkEntity>,
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {
    this.apiKey = this.configService.get<string>('TWEETSCOUT_API_KEY');
    this.apiUrl = this.configService.get<string>('TWEETSCOUT_API_URL', 'https://api.tweetscout.io/v2');
    this.accountName = this.configService.get<string>('TWITTER_ACCOUNT_NAME', 'y_allery');
    this.twitterScoreKey = this.configService.get<string>('TWITTER_SCORE_API_KEY');
    this.twitterScoreUrl = this.configService.get<string>('TWITTER_SCORE_API_URL', 'https://twitterscore.io/api/v1');
    this.twitterId = this.configService.get<string>('TWITTER_ACCOUNT_ID');
  }
  async createAdminContest(data: CreateContestDto) {
    return this.contestService.createAdminContest(data);
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
      const baseUrl = this.configService.get<string>('WEB_APP_URL') || 'https://yallery.web.app';
      if (contestId && Number(contestId) > 0) {
        referralLink = `${baseUrl.replace(/\/$/, '')}/contests/${contestId}?ref=${referralToken}`;
      } else {
        referralLink = `${baseUrl.replace(/\/$/, '')}/?ref=${referralToken}`;
      }
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

  async checkReferralFlag(params: {
    referralToken: string;
    partnerUserId: string;
    flag: string; // e.g. 'posted_to_twitter'
  }): Promise<{ status: boolean }> {
    const { referralToken, partnerUserId, flag } = params;
    const partnership = await this.partnerShipRepo.findOne({
      where: { referralToken },
    });
    if (!partnership) {
      return { status: false };
    }
    const link = await this.partnerUserLinkRepository.findOne({
      where: {
        partnershipId: partnership.id,
        partnerUserId,
      },
    });
    console.log(link)
    if (!link || !link.userId) {
      return { status: false };
    }
    const normalizedFlag = (flag || '').trim();
    const userIdNum = Number(link.userId);
    
    // Special handling for posted_to_twitter flag - check retweet
    if (normalizedFlag === 'posted_to_twitter') {
      try {
        // Find the user to get their Twitter username
        const user = await this.userRepository.findOne({
          where: { id: userIdNum },
        });
        
        if (!user || !user.twitterUsername) {
          console.log(`[checkReferralFlag] User ${userIdNum} not found or no Twitter username`);
          return { status: false };
        }
        
        // Find the latest post with tweetLink for this user
        const latestPost = await this.postRepository.findOne({
          where: { 
            user: { id: userIdNum },
            tweetLink: Not('')
          },
          order: { createdAt: 'DESC' }
        });
        
        if (!latestPost || !latestPost.tweetLink) {
          console.log(`[checkReferralFlag] No tweet found for user ${userIdNum}`);
          return { status: false };
        }
        
        console.log(`[checkReferralFlag] Checking retweet for user ${user.twitterUsername}, tweet: ${latestPost.tweetLink}`);
        
        // Check if user retweeted the latest post
        const retweetCheck = await this.checkRetweet(
          latestPost.tweetLink,
          user.twitterUsername.replace(/^@/, ''),
        );
        
        console.log(`[checkReferralFlag] Retweet check result:`, retweetCheck);
        return { status: retweetCheck.retweet };
        
      } catch (error) {
        console.error(`[checkReferralFlag] Error checking retweet:`, error);
        return { status: false };
      }
    }
    
    // For other flags, check partnership activity as before
    const exists = await this.partnerShipActivityRepository
      .createQueryBuilder('pa')
      .where('pa.partnershipId = :pid', { pid: partnership.id })
      .andWhere('pa.userId = :uid', { uid: userIdNum })
      .andWhere('pa.activity = :flag', { flag: normalizedFlag })
      .limit(1)
      .getOne();
    console.log(exists)
    return { status: !!exists };
  }

  async setReferralFlag(params: {
    referralToken: string;
    partnerUserId: string;
    flag: string; // e.g. 'posted_to_twitter'
  }): Promise<{ status: boolean }>
  {
    const { referralToken, partnerUserId, flag } = params;
    const partnership = await this.partnerShipRepo.findOne({ where: { referralToken } });
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

  async deletePartnership(partnershipId: number): Promise<{ success: boolean; message: string }> {
    try {
      const partnership = await this.partnerShipRepo.findOne({ where: { id: partnershipId } });
      if (!partnership) {
        return { success: false, message: 'Partnership not found' };
      }

      // Delete related data in correct order to avoid foreign key constraints
      // 1. Delete partnership activities first
      await this.partnerShipActivityRepository.delete({ partnershipId });
      
      // 2. Delete partner user links
      await this.partnerUserLinkRepository.delete({ partnershipId });
      
      // 3. Finally delete the partnership
      await this.partnerShipRepo.delete(partnershipId);

      return { success: true, message: 'Partnership and all related data deleted successfully' };
    } catch (error) {
      console.error('Error deleting partnership:', error);
      return { success: false, message: 'Failed to delete partnership' };
    }
  }

  async forceStartContest(contestId: number) {
    console.log(`🚀 Force starting contest ID ${contestId}`);
    try {
      // Знаходимо контест
      const contest = await this.contestService.findContestById(contestId);
      
      if (!contest) {
        console.log(`❌ Contest with ID ${contestId} not found`);
        return {
          success: false,
          message: 'Contest not found',
          timestamp: new Date().toISOString(),
        };
      }

      // Перевіряємо, чи контест не вже активний
      if (contest.status === ContestStatusEnum.OPEN) {
        console.log(`⚠️ Contest is already active`);
        return {
          success: false,
          message: 'Contest is already active',
          timestamp: new Date().toISOString(),
        };
      }

      // Форсуємо запуск контесту
      const currentTime = new Date();
      contest.status = ContestStatusEnum.OPEN;
      contest.startTime = currentTime;
      contest.is_approved = false;

      // Зберігаємо контест
      await this.contestService.updateContest(contestId, {
        status: ContestStatusEnum.OPEN,
        start_time: currentTime,
        end_time: contest.endTime,
      });

      // Відправляємо нотифікації для цього конкретного контесту
      await this.contestService.sendContestStartNotifications(contest);

      console.log(`✅ Contest "${contest.name}" force started successfully`);
      return {
        success: true,
        message: `Contest "${contest.name}" has been force started successfully`,
        contestId: contest.id,
        contestName: contest.name,
        startTime: currentTime.toISOString(),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`❌ Force start contest error:`, error.message);
      return {
        success: false,
        message: 'Failed to force start contest',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  private async checkRetweet(
    tweetLink: string,
    userHandle: string,
  ): Promise<{ retweet: boolean }> {
    const options = {
      method: 'POST',
      hostname: 'api.tweetscout.io',
      path: '/v2/check-retweet',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ApiKey: this.apiKey,
      },
    };

    const body = JSON.stringify({
      tweet_link: tweetLink,
      user_handle: userHandle,
    });

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        const chunks: Uint8Array[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks).toString();
          try {
            const parsed = JSON.parse(responseBody);
            if (typeof parsed.retweet === 'boolean') {
              resolve({ retweet: parsed.retweet });
            } else {
              resolve({ retweet: false });
            }
          } catch (error) {
            resolve({ retweet: false });
          }
        });
      });

      req.on('error', (e) => {
        resolve({ retweet: false });
      });

      req.write(body);
      req.end();
    });
  }
}
