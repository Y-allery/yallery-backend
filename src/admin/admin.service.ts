import { Injectable, Logger } from '@nestjs/common';
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
import { Repository, Between } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { PartnershipActivityEntity } from './entities/partnership-activity.entity';
import { PartnerUserLinkEntity } from './entities/partner-user-link.entity';
import { PostEntity } from 'src/post/entities/post.entity';
import { UserEntity } from 'src/user/entities/user.entity';
import { AISettingsEntity } from 'src/image-generation/entities/ai-settings.entity';
import { UpdateAISettingsDto } from './dto/update-ai-settings.dto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as https from 'https';
import { AdminMetricsEntity } from './entities/admin-metrics.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LikeEntity } from 'src/like/entities/like.entity';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
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
    @InjectRepository(AISettingsEntity)
    private readonly aiSettingsRepository: Repository<AISettingsEntity>,
    @InjectRepository(AdminMetricsEntity)
    private readonly adminMetricsRepository: Repository<AdminMetricsEntity>,
    @InjectRepository(LikeEntity)
    private readonly likeRepository: Repository<LikeEntity>,
  ) {
    this.apiKey = this.configService.get<string>('TWEETSCOUT_API_KEY');
    this.apiUrl = this.configService.get<string>('TWEETSCOUT_API_URL', 'https://api.tweetscout.io/v2');
    this.accountName = this.configService.get<string>('TWITTER_ACCOUNT_NAME', 'y_allery');
    this.twitterScoreKey = this.configService.get<string>('TWITTER_SCORE_API_KEY');
    this.twitterScoreUrl = this.configService.get<string>('TWITTER_SCORE_API_URL', 'https://twitterscore.io/api/v1');
    this.twitterId = this.configService.get<string>('TWITTER_ACCOUNT_ID');
  }

  @Cron(CronExpression.EVERY_HOUR)
  async collectAdminMetricsSnapshot() {
    const now = new Date();
    const periodEnd = new Date(now.getTime());
    // Фіксований період: останні 7 днів
    const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      newUsers,
      totalUsers,
      newPosts,
      newImagePosts,
      newVideoPosts,
      totalPosts,
      totalImagePosts,
      totalVideoPosts,
      newLikes,
      totalLikes,
    ] = await Promise.all([
      this.userRepository.count({
        where: {
          createdAt: Between(periodStart, periodEnd),
        },
      }),
      this.userRepository.count(),
      this.postRepository.count({
        where: {
          createdAt: Between(periodStart, periodEnd),
        },
      }),
      this.postRepository
        .createQueryBuilder('p')
        .where('p.createdAt >= :start AND p.createdAt < :end', {
          start: periodStart,
          end: periodEnd,
        })
        .andWhere('p.imageUrl IS NOT NULL AND p.imageUrl != ""')
        .getCount(),
      this.postRepository
        .createQueryBuilder('p')
        .where('p.createdAt >= :start AND p.createdAt < :end', {
          start: periodStart,
          end: periodEnd,
        })
        .andWhere('p.videoUrl IS NOT NULL AND p.videoUrl != ""')
        .getCount(),
      this.postRepository.count(),
      this.postRepository
        .createQueryBuilder('p')
        .where('p.imageUrl IS NOT NULL AND p.imageUrl != ""')
        .getCount(),
      this.postRepository
        .createQueryBuilder('p')
        .where('p.videoUrl IS NOT NULL AND p.videoUrl != ""')
        .getCount(),
      this.likeRepository.count({
        where: {
          createdAt: Between(periodStart, periodEnd),
        },
      }),
      this.likeRepository.count(),
    ]);

    const activeUsersRaw = await this.postRepository
      .createQueryBuilder('p')
      .select('COUNT(DISTINCT p.userId)', 'cnt')
      .where('p.createdAt >= :start AND p.createdAt < :end', {
        start: periodStart,
        end: periodEnd,
      })
      .getRawOne();

    const activeUsers = Number(activeUsersRaw?.cnt || 0);

    const snapshot = this.adminMetricsRepository.create({
      periodStart,
      periodEnd,
      newUsers,
      totalUsers,
      newPosts,
      newImagePosts,
      newVideoPosts,
      totalPosts,
      totalImagePosts,
      totalVideoPosts,
      activeUsers,
      newLikes,
      totalLikes,
    });

    await this.adminMetricsRepository.save(snapshot);
  }

  async getAdminMetricsOverview() {
    const latest = await this.adminMetricsRepository
      .createQueryBuilder('m')
      .orderBy('m.snapshotTime', 'DESC')
      .limit(1)
      .getOne();

    if (!latest) {
      return {
        from: null,
        to: null,
        newUsers: 0,
        totalUsers: 0,
        newPosts: 0,
        newImagePosts: 0,
        newVideoPosts: 0,
        totalPosts: 0,
        totalImagePosts: 0,
        totalVideoPosts: 0,
        activeUsers: 0,
        newLikes: 0,
        totalLikes: 0,
      };
    }

    return {
      from: latest.periodStart,
      to: latest.periodEnd,
      newUsers: latest.newUsers,
      totalUsers: latest.totalUsers,
      newPosts: latest.newPosts,
      newImagePosts: latest.newImagePosts,
      newVideoPosts: latest.newVideoPosts,
      totalPosts: latest.totalPosts,
      totalImagePosts: latest.totalImagePosts,
      totalVideoPosts: latest.totalVideoPosts,
      activeUsers: latest.activeUsers,
      newLikes: latest.newLikes,
      totalLikes: latest.totalLikes,
    };
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
      this.logger.log('Branch.io payload: ' + JSON.stringify(branchPayload, null, 2));
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

  async getPartnershipsWithUserLinks() {
    const partnerships = await this.partnerShipRepo.find({
      order: { createdAt: 'DESC' },
    });

    const results = [];
    for (const partnership of partnerships) {
      const links = await this.partnerUserLinkRepository.find({
        where: { partnershipId: partnership.id },
        relations: ['user'],
      });

      results.push({
        partnership: {
          id: partnership.id,
          partnerName: partnership.partnerName,
          companyName: partnership.companyName,
          source: partnership.source,
          referralToken: partnership.referralToken,
          referralLink: partnership.referralLink,
          createdAt: partnership.createdAt,
        },
        userLinks: links.map(link => ({
          id: link.id,
          partnerUserId: link.partnerUserId,
          userId: link.userId,
          user: link.user ? {
            id: link.user.id,
            email: link.user.email,
            twitterUsername: link.user.twitterUsername,
          } : null,
          createdAt: link.createdAt,
        })),
      });
    }

    return results;
  }

  async checkReferralFlag(params: {
    referralToken: string;
    partnerUserId: string;
    flag: string; // e.g. 'posted_to_twitter'
  }): Promise<{ status: string }> {
    const { referralToken, partnerUserId, flag } = params;
    
    const partnership = await this.partnerShipRepo.findOne({
      where: { referralToken },
    });
    
    if (!partnership) {
      return { status: "false" };
    }
    
    const link = await this.partnerUserLinkRepository.findOne({
      where: {
        partnershipId: partnership.id,
        partnerUserId,
      },
    });
    
    if (!link || !link.userId) {
      return { status: "false" };
    }
    
    const normalizedFlag = (flag || '').trim();
    const userIdNum = Number(link.userId);
    
    // Special handling for retweet flag - check retweet
    if (normalizedFlag === 'retweet') {
      try {
        // Check if user already has retweet activity in database (cache check)
        const existingActivity = await this.partnerShipActivityRepository
          .createQueryBuilder('pa')
          .where('pa.partnershipId = :pid', { pid: partnership.id })
          .andWhere('pa.userId = :uid', { uid: userIdNum })
          .andWhere('pa.activity = :flag', { flag: 'retweet' })
          .limit(1)
          .getOne();
        
        // If we have a cached result, return it
        if (existingActivity) {
          return { status: "true" };
        }
        
        // If no cached result, check with Twitter API
        const user = await this.userRepository.findOne({
          where: { id: userIdNum },
        });
        
        if (!user || !user.twitterUsername) {
          return { status: "false" };
        }
        
        const twitterUsername = user.twitterUsername.replace(/^@/, '');
        const retweetCheck = await this.checkRetweet(
          twitterUsername,
          partnership.id,
          userIdNum
        );
        
        return { status: retweetCheck.retweet ? "true" : "false" };
        
      } catch (error) {
        this.logger.error(`[checkReferralFlag] Error checking retweet: ${error.message}`, error.stack);
        return { status: "false" };
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
    
    return { status: !!exists ? "true" : "false" };
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
      // Check up to 15 tweets across multiple pages if needed
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
                this.logger.error(`[checkRetweet] JSON parse error: ${error.message}`, error.stack);
                reject(error);
              }
            });
          });

          req.on('error', (e) => {
            this.logger.error(`[checkRetweet] Request error: ${e.message}`, e.stack);
            reject(e);
          });

          req.write(JSON.stringify(requestBody));
          req.end();
        });

        const tweets = response?.tweets || [];

        // Check each tweet for @yallery mention
        for (const tweet of tweets) {
          totalTweetsChecked++;
          
          if (totalTweetsChecked > maxTweetsToCheck) {
            break;
          }

          const tweetText = tweet.full_text || '';
          const tweetId = tweet.id_str || 'unknown';
          
          if (tweetText.toLowerCase().includes(searchText.toLowerCase())) {
            // Found @yallery mention - log tweet information
            this.logger.log(`[checkRetweet] ✅ FOUND POST WITH @yallery MENTION!`);
            this.logger.log(`[checkRetweet] Tweet ID: ${tweetId}`);
            this.logger.log(`[checkRetweet] Full Text: "${tweetText}"`);
            this.logger.log(`[checkRetweet] Tweet URL: https://twitter.com/${userHandle}/status/${tweetId}`);
            found = true;
            break;
          }
        }

        // If we found it, break the loop
        if (found) {
          break;
        }

        // Check if there are more tweets to fetch
        cursor = response?.next_cursor || null;
        if (!cursor || tweets.length === 0) {
          break;
        }
      }

      // If retweet is true, save to database for future checks
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
          this.logger.error(`[checkRetweet] Error saving to database: ${error.message}`, error.stack);
        }
      }

      return { retweet: found };
    } catch (error) {
      this.logger.error(`[checkRetweet] Error checking retweet for ${userHandle}: ${error.message}`, error.stack);
      return { retweet: false };
    }
  }

  async getAllAISettings(): Promise<{
    image: AISettingsEntity[];
    video: AISettingsEntity[];
    all: AISettingsEntity[];
  }> {
    const allSettings = await this.aiSettingsRepository.find({
      order: { id: 'ASC' },
    });

    const imageSettings = allSettings.filter((s) => s.type === 'image');
    const videoSettings = allSettings.filter((s) => s.type === 'video');

    return {
      image: imageSettings,
      video: videoSettings,
      all: allSettings,
    };
  }

  async updateAISettings(
    id: number,
    updateDto: UpdateAISettingsDto,
  ): Promise<AISettingsEntity> {
    const aiSetting = await this.aiSettingsRepository.findOne({
      where: { id },
    });

    if (!aiSetting) {
      throw new NotFoundException(`AI settings with ID ${id} not found`);
    }

    if (updateDto.ai_service && updateDto.ai_service !== aiSetting.ai_service) {
      const existingService = await this.aiSettingsRepository.findOne({
        where: { ai_service: updateDto.ai_service },
      });

      if (existingService && existingService.id !== id) {
        throw new BadRequestException(
          `AI service '${updateDto.ai_service}' already exists`,
        );
      }
    }

    Object.assign(aiSetting, updateDto);

    return await this.aiSettingsRepository.save(aiSetting);
  }
}
