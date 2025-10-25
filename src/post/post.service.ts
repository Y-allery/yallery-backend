import { TagService } from './../tag/tag.service';
import { getBrowser, performRandomActions, randomDelay, setupPage, checkForBlocking } from 'src/common/puppeteer-browser';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PostEntity } from './entities/post.entity';
import { TagEntity } from 'src/tag/entities/tag.entity';
import { ViewedPostEntity } from './entities/viwed.entity';
import { UserEntity } from 'src/user/entities/user.entity';
import { GenerateImageDto } from 'src/image-generation/dto/generate.image.dto';
import { ContestService } from 'src/contest/contest.service';
import { ReportPostDto } from './dto/report.post.dto';
import { ReportPostEntity } from './entities/report.post.entity';
import { StyleEntity } from './entities/style.entity';
import { CreateStyleDto } from './dto/create.style.dto';
import { ActivityService } from 'src/activity/activity.service';
import { ActivityEnum } from 'src/activity/types/activity.enum';
import { RoleEnum } from 'src/user/types/role.enum';
import * as sharp from 'sharp';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { PartnershipActivityEntity } from 'src/admin/entities/partnership-activity.entity';
import { PartnerUserLinkEntity } from 'src/admin/entities/partner-user-link.entity';

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
const randomSleep = async () =>
  await sleep(1000 + Math.floor(Math.random() * 1000));

@Injectable()
export class PostService {
  constructor(
    @InjectRepository(PostEntity)
    private postEntity: Repository<PostEntity>,
    @InjectRepository(StyleEntity)
    private styleEntity: Repository<StyleEntity>,
    @InjectRepository(TagEntity)
    private tagEntity: Repository<TagEntity>,
    @InjectRepository(UserEntity)
    private userEntity: Repository<UserEntity>,
    @InjectRepository(ViewedPostEntity)
    private viwedPostEntity: Repository<ViewedPostEntity>,
    @InjectRepository(ReportPostEntity)
    private reportPostEntity: Repository<ReportPostEntity>,
    @InjectRepository(ViewedPostEntity)
    private viewedPostRepository: Repository<ViewedPostEntity>,
    @InjectRepository(PostEntity)
    private postRepository: Repository<PostEntity>,
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    private contestService: ContestService,
    private activityService: ActivityService,
    private tagService: TagService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => NotificationGateway))
    private readonly notificationGateway: NotificationGateway,
    @InjectRepository(PartnerUserLinkEntity)
    private readonly partnerUserLinkRepo: Repository<PartnerUserLinkEntity>,
    @InjectRepository(PartnershipActivityEntity)
    private readonly partnershipActivityRepo: Repository<PartnershipActivityEntity>,
  ) {}

  async getPosts(cursor: number | null, limit: number, userId: number) {
    const cursorCondition = cursor ? `AND p.id < ${cursor}` : '';

    const query = `
      SELECT DISTINCT
        p.id, 
        p.imageUrl AS image_url, 
        p.videoUrl AS video_url, 
        p.createdAt AS created_at,
        u.id AS user_id,
        t.id AS tag_id,
        CONCAT('#', t.name) AS tag_name,
        (SELECT COUNT(*) FROM likes WHERE postId = p.id) AS like_count,
        CASE 
          WHEN EXISTS (SELECT 1 FROM likes WHERE postId = p.id AND userId = ${userId}) 
          THEN TRUE 
          ELSE FALSE 
        END AS is_liked,
        FALSE AS is_viewed  
      FROM 
        posts p
        JOIN users u ON p.userId = u.id
        JOIN tags t ON p.tagId = t.id
      WHERE 
        p.is_published = true 
        AND p.is_blocked = false
        AND NOT EXISTS (SELECT 1 FROM viewed_posts WHERE postId = p.id AND userId = ${userId})
        AND p.tagId IN (
          SELECT tagsId
          FROM users_tags_tags t
          WHERE t.usersId = ${userId}
        )
        ${cursorCondition} -- Додаємо умову курсора
      ORDER BY 
        p.id DESC -- Порядок для курсора
      LIMIT ${limit};
    `;

    const posts = await this.postEntity.query(query);
    const nextCursor = posts.length > 0 ? posts[posts.length - 1].id : null;

    return {
      data: posts,
      nextCursor,
      hasNextPage: posts.length === limit,
    };
  }

  async findPostsByTag(
    tagId: number,
    page: number,
    limit: number,
  ): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const offset = (page - 1) * limit;

    const postsQuery = this.tagEntity
      .createQueryBuilder('tag')
      .leftJoinAndSelect('tag.posts', 'post')
      .leftJoinAndSelect('post.user', 'user')
      .leftJoin('post.likes', 'like')
      .select([
        'post.id AS post_id',
        'post.imageUrl AS post_imageUrl',
        'post.videoUrl AS post_videoUrl',
        'post.createdAt AS post_createdAt',
        'user.id AS user_id',
        'tag.id AS tag_id',
        `CONCAT('#', tag.name) AS tag_name`,
        `(SELECT COUNT(*) FROM likes l WHERE l.postId = post.id) AS likeCount`,
      ])
      .where('tag.id = :tagId', { tagId })
      .andWhere('post.is_published = :is_published', { is_published: true })
      .groupBy('post.id')
      .orderBy('post.createdAt', 'DESC')
      .offset(offset)
      .limit(limit)
      .getRawMany();

    const totalQuery = this.postEntity
      .createQueryBuilder('post')
      .where('post.tagId = :tagId', { tagId })
      .getCount();

    const [posts, total] = await Promise.all([postsQuery, totalQuery]);

    return {
      data: posts,
      total,
      page,
      limit,
    };
  }

  async publishPost(postId: number, userId: number) {
    console.log(`[publishPost] Starting publish for postId=${postId}, userId=${userId}`);
    
    console.log(postId, userId)
    const post = await this.postEntity.findOne({
      where: { id: postId, user: { id: userId } },
      relations: { user: true, contest: true, tag: true },
      select: {
        id: true,
        user: { id: true },
        contest: { id: true },
        tag: { id: true },
      },
    });
    
    console.log(`[publishPost] Post found:`, {
      postId,
      userId,
      postExists: !!post,
      isPublished: post?.is_published,
      hasContest: !!post?.contest,
      hasTag: !!post?.tag
    });
    
    const user = await this.userEntity.findOne({
      where: { id: userId },
      relations: { tags: true },
    });

    if (!post) {
      
      console.error(`[publishPost] Post not found or already published:`, { postId, userId });
      throw new NotFoundException('Post not found or already published');
    }

    if (post.user.id !== userId) {
      console.error(`[publishPost] User not allowed to publish:`, { postId, userId, postUserId: post.user.id });
      throw new ForbiddenException('You are not allowed to publish this post');
    }

    if (!post?.tag?.id) {
      console.error(`[publishPost] No tag selected:`, { postId, userId });
      throw new BadRequestException('Select tag first');
    }

    try {
      post.is_published = true;
      
      if (post.contest) {
        console.log(`[publishPost] Participating in contest:`, { postId, userId, contestId: post.contest.id });
        await this.contestService.participateInContest(post.contest.id, userId);
      }

      console.log(`[publishPost] Checking and subscribing to tag:`, { postId, userId, tagId: post.tag.id });
      await this.tagService.checkAndSubscribeToTag(user, post.tag.id);
      
      const savedPost = await this.postEntity.save(post);
      console.log(`[publishPost] Post published successfully:`, { postId, userId });
      
      return savedPost;
    } catch (error) {
      console.error(`[publishPost] Error publishing post:`, {
        postId,
        userId,
        error: error.message
      });
      throw error;
    }
  }
  async getUnpublishedPosts(userId: number) {
    const query = `
      SELECT 
        p.*,
        (SELECT COUNT(*) FROM likes WHERE likes.postId = p.id) AS like_count
      FROM posts p
      WHERE p.userId = ${userId} AND p.is_saved = true
      ORDER BY createdAt DESC
    `;

    return await this.postEntity.query(query);
  }
  async getPublishedPosts(userId: number) {
    const query = `
      SELECT 
        p.*,
        (SELECT COUNT(*) FROM likes WHERE likes.postId = p.id) AS like_count
      FROM posts p
      WHERE p.userId = ${userId} AND p.is_published = true
      ORDER BY createdAt DESC
    `;

    return await this.postEntity.query(query);
  }
  async markAllAsUnviewed(userId: number) {
    const result = await this.viewedPostRepository.delete({
      user: { id: userId },
    });

    return {
      message: 'All posts have been marked as unviewed.',
      deletedCount: result.affected,
    };
  }

  async markPostsAsViewed(postIds: number[], userId: number) {
    const posts = await this.postRepository.find({
      where: { id: In(postIds) },
    });

    const foundIds = posts.map((post) => post.id);
    const notFoundIds = postIds.filter((id) => !foundIds.includes(id));

    if (posts.length === 0) {
      return {
        message: 'No posts were marked as viewed.',
        markedCount: 0,
        notFoundIds,
      };
    }

    const existingViewedPosts = await this.viewedPostRepository.find({
      where: {
        post: { id: In(foundIds) },
        user: { id: userId },
      },
      relations: { post: true },
      select: ['post'],
    });

    const viewedPostIds = existingViewedPosts.map((vp) => vp.post.id);

    const newViewedPostIds = foundIds.filter(
      (id) => !viewedPostIds.includes(id),
    );

    if (newViewedPostIds.length === 0) {
      return {
        message: 'All existing posts have already been marked as viewed.',
        markedCount: 0,
        notFoundIds,
      };
    }

    const newViewedPosts = newViewedPostIds
      .map((id) => {
        const post = posts.find((p) => p.id === id);
        if (!post) return null;
        return this.viewedPostRepository.create({
          post,
          user: { id: userId },
        });
      })
      .filter((item) => item !== null);
    await this.viewedPostRepository.save(newViewedPosts);

    const response = {
      message:
        notFoundIds.length > 0
          ? 'Some posts were marked as viewed, but some posts were not found.'
          : 'All posts were successfully marked as viewed.',
      markedCount: newViewedPosts.length,
      notFoundIds,
    };

    return response;
  }
  async savePost(
    dto: GenerateImageDto,
    imageUrl: string,
    user_id: number,
    contest_id: number | null,
  ) {
    const post = this.postEntity.create({
      user: { id: user_id },
      imageUrl,
      tag: { id: dto.tag_id },
      contest: { id: contest_id },
      is_published: false,
    });
    const savedPost = await this.postEntity.save(post);
    return savedPost;
  }

  async blockPost(post_id: number) {
    const post = await this.postEntity.findOne({ where: { id: post_id } });
    if (!post) throw new NotFoundException('Post not found');

    post.is_blocked = true;
    await this.postEntity.save(post);
    return {
      success: true,
      message: 'Post blocked succesfully',
    };
  }

  async reportPost(dto: ReportPostDto, userId: number) {
    const { postId, description } = dto;

    const post = await this.postEntity.findOne({
      where: { id: postId },
      relations: ['user'],
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const existingReport = await this.reportPostEntity.findOne({
      where: {
        post: { id: postId },
        reportingUser: { id: userId },
      },
    });

    if (existingReport) {
      return { message: 'You have already reported this post' };
    }

    await this.activityService.createActivities(
      userId,
      [post.user.id],
      ActivityEnum.ADMIN_REPORT,
      undefined,
      true,
      undefined,
      post,
    );
    const newReport = this.reportPostEntity.create({
      reportingUser: { id: userId },
      reportedUser: { id: post.user.id },
      post,
      description,
    });

    await this.reportPostEntity.save(newReport);
    return { message: 'Report has been submitted successfully' };
  }

  async getReportPosts({ page, limit }: { page: number; limit: number }) {
    const offset = (page - 1) * limit;

    const queryBuilder = this.reportPostEntity
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.post', 'post')
      .leftJoinAndSelect('post.tag', 'tag')
      .leftJoinAndSelect('report.reportingUser', 'reportingUser')
      .leftJoinAndSelect('report.reportedUser', 'reportedUser')
      .orderBy('reportedUser.is_deleted', 'ASC')
      .addOrderBy('post.is_blocked', 'ASC')
      .addOrderBy('report.createdAt', 'DESC')
      .skip(offset)
      .take(limit);

    const [results, total] = await queryBuilder.getManyAndCount();

    return {
      data: results.map((report) => ({
        reportId: report.id,
        postId: report.post.id,
        postImageUrl: report.post.imageUrl,
        tagName: report.post.tag ? report.post.tag.name : null,
        reportingUserId: report.reportingUser.id,
        reportingUserName: report.reportingUser.name,
        reportedUserId: report.reportedUser.id,
        reportedUserName: report.reportedUser.name,
        description: report.description,
        reportDate: report.createdAt,
        is_user_blocked: report.reportedUser.is_deleted,
        is_post_blocked: report.post.is_blocked,
      })),
      total,
      page,
      limit,
    };
  }
  async unblockPost(post_id: number) {
    const post = await this.postEntity.findOne({
      where: { id: post_id, is_blocked: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    post.is_blocked = false;
    await this.postEntity.save(post);
    return {
      success: true,
      message: 'Post unblocked successfully',
    };
  }

  async createStyle(dto: CreateStyleDto): Promise<StyleEntity> {
    const newStyle = this.styleEntity.create(dto);
    return this.styleEntity.save(newStyle);
  }

  async findAllStyles(): Promise<StyleEntity[]> {
    return this.styleEntity.find();
  }

  async findStyleById(id: number): Promise<StyleEntity> {
    return this.styleEntity.findOne({ where: { id } });
  }

  async rejectComplaint(
    reportId: number,
  ): Promise<{ success: boolean; message: string }> {
    const report = await this.reportPostEntity.findOne({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    await this.reportPostEntity.remove(report);

    return {
      success: true,
      message: 'Complaint rejected and report deleted successfully.',
    };
  }

  async updateStyle(id: number, dto: CreateStyleDto): Promise<StyleEntity> {
    const style = await this.styleEntity.preload({
      id: id,
      ...dto,
    });
    if (!style) throw new NotFoundException(`Style with ID ${id} not found`);
    return this.styleEntity.save(style);
  }

  async deleteStyle(id: number): Promise<void> {
    const result = await this.styleEntity.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Style with ID ${id} not found`);
    }
  }

  async deleteUserAccount(user_id: number) {
    const user = await this.userEntity.findOne({
      where: { id: user_id, is_deleted: false },
    });
    if (!user) throw new NotFoundException('User not found');

    user.is_deleted = true;
    await this.userEntity.save(user);
    return { status: 'Success', message: 'User deleted successfully' };
  }

  async getPostById(postId: number): Promise<any> {
    const post = await this.postEntity.findOne({
      where: { id: postId },
      relations: ['user', 'tag', 'contest', 'likes'],
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return {
      id: post.id,
      imageUrl: post.imageUrl,
      createdAt: post.createdAt,
      user: {
        id: post.user.id,
        name: post.user.name,
        email: post.user.email,
        avatarUrl: post.user.avatar,
      },
      tag: {
        id: post.tag.id,
        name: post.tag.name,
      },
      contest: post.contest
        ? {
            id: post.contest.id,
            name: post.contest.name,
            status: post.contest.status,
            description: post.contest.description,
          }
        : null,
      likeCount: post.likes.length,
      isPublished: post.is_published,
      isBlocked: post.is_blocked,
      isRejected: post.is_rejected,
    };
  }

  async deleteReport(
    reportId: number,
  ): Promise<{ success: boolean; message: string }> {
    const report = await this.reportPostEntity.findOne({
      where: { id: reportId },
      relations: { reportedUser: true, reportingUser: true, post: true },
    });
    const admins = await this.userEntity.find({
      where: { role: RoleEnum.ADMIN },
    });
    if (!report) {
      throw new NotFoundException('Report not found');
    }

    await this.activityService.deleteAdminPostActivity(
      report.post.id,
      report.reportingUser.id,
    );
    await this.activityService.createActivities(
      null,
      admins.map((e) => e.id),
      ActivityEnum.ADMIN_REPORT_REVIEW,
      undefined,
      true,
      undefined,
      report.post,
    );

    await this.reportPostEntity.delete(reportId);
    return {
      success: true,
      message: 'Report deleted successfully',
    };
  }

  async getPostImageWithWatermark(
    postId: number,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const post = await this.postEntity.findOne({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }


    if (post.videoUrl) {
      try {
        const response = await axios.get(post.videoUrl, {
          responseType: 'arraybuffer',
        });

        return {
          buffer: Buffer.from(response.data, 'binary'),
          contentType: 'video/mp4',
          filename: `post_${postId}.mp4`,
        };
      } catch (error) {
        throw new NotFoundException('Error fetching video from URL');
      }
    }


    let imageBuffer: Buffer;
    try {
      const response = await axios.get(post.imageUrl, {
        responseType: 'arraybuffer',
      });
      imageBuffer = Buffer.from(response.data, 'binary');
    } catch (error) {
      throw new NotFoundException('Error fetching image from URL');
    }

    const watermarkPath = path.join(
      __dirname,
      '..',
      '..',
      'public',
      'watermark.png',
    );
    if (!fs.existsSync(watermarkPath)) {
      throw new NotFoundException('Watermark file not found');
    }
    const watermarkBuffer = fs.readFileSync(watermarkPath);

    let processedImageBuffer: Buffer;
    try {
      processedImageBuffer = await sharp(imageBuffer)
        .composite([{ input: watermarkBuffer, gravity: 'southeast' }])
        .toBuffer();
    } catch (error) {
      throw new Error('Error processing image');
    }

    return {
      buffer: processedImageBuffer,
      contentType: 'image/png',
      filename: `post_${postId}.png`,
    };
  }
  async share(
    userId: number,
  ): Promise<{ message: string; pointsAwarded: number }> {
    const dailyPoints = this.configService.get('SHARE_YEPS') || 5;
    const now = new Date();
    const startOfToday = new Date(now.setHours(0, 0, 0, 0));

    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.lastShareRewardAt && user.lastShareRewardAt >= startOfToday) {
      return {
        message: 'You have already received points for sharing today.',
        pointsAwarded: 0,
      };
    }

    user.lastShareRewardAt = now;
    user.points += dailyPoints;
    await this.userRepository.save(user);

    await this.notificationGateway.emitProfileUpdate(user.id.toString());
    return {
      message: 'Points awarded successfully for sharing.',
      pointsAwarded: dailyPoints,
    };
  }

  async tweetImageViaPuppeteer(
    post_id: string,
    userId: number,
  ): Promise<{ message: string; tweetUrl: string }> {
    console.log('[tweetImageViaPuppeteer] Starting tweet process for post:', post_id, 'user:', userId);
    
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      console.log('[tweetImageViaPuppeteer] ERROR: User not found');
      throw new NotFoundException('User not found');
    }
    console.log('[tweetImageViaPuppeteer] User found:', user.twitterUsername);

    console.log('[tweetImageViaPuppeteer] Finding post with relations...');
    const post = await this.postEntity.findOne({
      where: { id: +post_id },
      relations: ['contest', 'contest.tag'],
    });

    if (!post) {
      console.log('[tweetImageViaPuppeteer] ERROR: Post not found');
      throw new NotFoundException('Post not found');
    }
    console.log('[tweetImageViaPuppeteer] Post found:', post.id, 'contest:', post.contest?.id, 'tag:', post.tag?.name);

    const SESSION_PATH = path.resolve(
      process.cwd(),
      'src',
      'public',
      'twitter-session.json',
    );

    // Try different browser paths
    const possiblePaths = [
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/snap/bin/chromium'
    ];
    
    // Try environment variable first, then different browser paths
    let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    
    if (!executablePath) {
      try {
        const fs = require('fs');
        for (const path of possiblePaths) {
          if (fs.existsSync(path)) {
            executablePath = path;
            break;
          }
        }
      } catch (error) {
        // Ignore error, will use bundled Chrome
      }
    }
    
    if (executablePath) {
      console.log(`[Puppeteer] Using system browser: ${executablePath}`);
    } else {
      console.log('[Puppeteer] No system browser found, using bundled Chrome');
    }

    const browser = await getBrowser();
    const page = await browser.newPage();
    await setupPage(page);

    const TWITTER_USERNAME = this.configService.get<string>('TWITTER_USERNAME');
    const TWITTER_PASSWORD = this.configService.get<string>('TWITTER_PASSWORD');

    if (fs.existsSync(SESSION_PATH)) {
      const cookies = JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
      await page.setCookie(...cookies);
      await page.goto('https://twitter.com/home', {
        waitUntil: 'networkidle2',
      });

      await new Promise((res) => setTimeout(res, 3000));
      const is2faPrompt = await page.$(
        'input[name="text"][inputmode="numeric"]',
      );
      if (is2faPrompt) {
        await page.close();
        return await this._recoverSessionViaGmail(post_id, userId);
      }

      const isLoggedIn = await page.evaluate(() =>
        Boolean(
          document.querySelector(
            '[data-testid="SideNav_AccountSwitcher_Button"]',
          ),
        ),
      );

      if (isLoggedIn) {
        return await this._postTweet(page, post, user, TWITTER_USERNAME);
      } else {
        // Skip if user is null
        if (!user) {
          console.log('[tweetImageViaPuppeteer] SKIPPING: User is null, cannot proceed');
          return { message: 'Skipped: User not found', tweetUrl: '' };
        }
      }
    }

    

    const isCodeInputPresent = await page.$(
      'input[name="text"][inputmode="numeric"]',
    );

    if (isCodeInputPresent) {
      await page.close();
      return await this._recoverSessionViaGmail(post_id, userId);
    }

    await page.goto('https://twitter.com/login', { waitUntil: 'networkidle2' });

    await page.waitForSelector('input[name="text"]', { timeout: 10000 });
    await page.type('input[name="text"]', TWITTER_USERNAME);
    await page.keyboard.press('Enter');
    await randomSleep();

    try {
      await page.waitForSelector('input[name="text"]', { timeout: 3000 });
      const inputVisible = await page.$eval(
        'input[name="text"]',
        (el) => (el as HTMLElement).offsetParent !== null,
      );
      if (inputVisible) {
        await page.type('input[name="text"]', TWITTER_USERNAME);
        await page.keyboard.press('Enter');
        await randomSleep();
      }
    } catch (e) {}

    
    await page.waitForSelector('input[name="password"]', { timeout: 10000 });
    await page.type('input[name="password"]', TWITTER_PASSWORD);
    await page.keyboard.press('Enter');
    await randomSleep();

    try {
      await page.waitForSelector('input[data-testid="ocfEnterTextTextInput"]', {
        timeout: 5000,
      });

      const CONFIRM_CODE_PATH = path.resolve(
        __dirname,
        '..',
        '..',
        'public',
        'twitter-confirmation-code.txt',
      );

      let savedCode: string | null = null;
      if (fs.existsSync(CONFIRM_CODE_PATH)) {
        savedCode = fs.readFileSync(CONFIRM_CODE_PATH, 'utf8').trim();
      }

      if (savedCode) {
        await page.waitForSelector(
          'input[data-testid="ocfEnterTextTextInput"]',
          {
            timeout: 10000,
          },
        );

        const codeInput = await page.$(
          'input[data-testid="ocfEnterTextTextInput"]',
        );
        if (!codeInput) {
          await page.close();
          return await this._recoverSessionViaGmail(post_id, userId);
        }

        await codeInput.focus();
        await page.evaluate(() => {
          const el = document.activeElement as HTMLInputElement;
          if (el) el.value = '';
        });

        await page.type(
          'input[data-testid="ocfEnterTextTextInput"]',
          savedCode,
          {
            delay: 100,
          },
        );

        await page.keyboard.press('Enter');
        await randomSleep();


        const stillOnCodeInput = await page.$(
          'input[data-testid="ocfEnterTextTextInput"]',
        );
        if (stillOnCodeInput) {
          fs.unlinkSync(CONFIRM_CODE_PATH);
          await page.close();
          return await this._recoverSessionViaGmail(post_id, userId);
        }
      } else {
        await page.close();
        return await this._recoverSessionViaGmail(post_id, userId);
      }
    } catch (err) {}

    const cookies = await page.cookies();
    const requiredCookies = cookies.filter((cookie) =>
      ['auth_token', '_twitter_sess', 'ct0', 'att'].includes(cookie.name),
    );
    fs.writeFileSync(SESSION_PATH, JSON.stringify(requiredCookies, null, 2));

    // Skip if user is null
    if (!user) {
      console.log('[tweetImageViaPuppeteer] SKIPPING: User is null, cannot proceed');
      return { message: 'Skipped: User not found', tweetUrl: '' };
    }

    return await this._postTweet(page, post, user, TWITTER_USERNAME);
  }

  private async _postTweet(
    page: any,
    post: PostEntity,
    user: UserEntity,
    twitterUsername: string,
  ): Promise<{ message: string; tweetUrl: string }> {
    console.log('[_postTweet] Starting tweet process...');
    console.log('[_postTweet] Post ID:', post.id);
    console.log('[_postTweet] User:', user?.twitterUsername || 'null');
    console.log('[_postTweet] Image URL:', post.imageUrl);
    
    // Skip posting if user is null
    if (!user) {
      console.log('[_postTweet] SKIPPING: User is null, cannot post');
      return { message: 'Skipped: User not found', tweetUrl: '' };
    }
    
    console.log('[_postTweet] Navigating to Twitter compose page...');
    await page.goto('https://twitter.com/compose/tweet', {
      waitUntil: 'networkidle2',
    });
    console.log('[_postTweet] Successfully navigated to Twitter compose page');

    // Перевіряємо на блокування
    const isBlocked = await checkForBlocking(page);
    if (isBlocked) {
      console.log('[_postTweet] Page appears to be blocked, skipping...');
      return { message: 'Skipped: Page blocked', tweetUrl: '' };
    }

    // Рандомні дії для імітації користувача
    await performRandomActions(page);
    await randomDelay(2000, 4000);
    



    const tweetText = post.contest && post.contest.tag 
      ? `Generated by ${user.twitterUsername} #${post.contest.tag.name} #${post.id}`
      : post.tag 
        ? `Generated by ${user.twitterUsername} #${post.tag.name} #${post.id}`
        : `Generated by ${user.twitterUsername} #post #${post.id}`;
    
    try {
      await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });
      await page.type('[data-testid="tweetTextarea_0"]', tweetText);
    } catch (error) {
      const selectors = [
        '[data-testid="tweetTextarea_0"]',
        '[data-testid="tweetTextarea"]',
        '[contenteditable="true"]',
        'div[role="textbox"]',
        'textarea'
      ];
      
      for (const selector of selectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await page.type(selector, tweetText);
            break;
          }
        } catch (e) {
  
        }
      }
    }

    
    const input = await page.$('input[type="file"]');
    if (!input) {
      throw new Error('Tweet image upload field not found');
    }

    const imagePath = await this.downloadImageToTmp(post.imageUrl);
    
    if (!fs.existsSync(imagePath)) {
      throw new Error('Image file was not saved');
    }

    try {
      await randomSleep();
      await input.uploadFile(imagePath);
      
      // Рандомні дії після завантаження зображення
      await performRandomActions(page);
      await randomDelay(1500, 3000);
      
    } catch (error) {
      console.error('[_postTweet] ERROR uploading image:', error.message);
      throw error;
    }
    
    await page.focus('[data-testid="tweetTextarea_0"]');
    await page.keyboard.press('ArrowDown');
    await randomSleep();

    // Рандомні дії перед публікацією
    await performRandomActions(page);
    await randomDelay(1000, 2500);

    
    let tweetButton = await page.$('[data-testid="tweetButton"]');
    
    if (!tweetButton) {
      const buttonSelectors = [
        '[data-testid="tweetButton"]',
        '[data-testid="postButton"]',
        'button[type="submit"]',
        'button:contains("Post")',
        'button:contains("Tweet")'
      ];
      
      for (const selector of buttonSelectors) {
        tweetButton = await page.$(selector);
        if (tweetButton) break;
      }
    }
    
    if (!tweetButton) {
      throw new Error('Tweet button not found');
    }

    await page.focus('[data-testid="tweetTextarea_0"]');
    await page.keyboard.type(' ');
    await randomSleep();
    if (imagePath && fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
    const isButtonDisabled = await tweetButton.evaluate((btn) =>
      btn.hasAttribute('disabled'),
    );

    if (isButtonDisabled) {
      return {
        message: 'Tweet button disabled, tweet not sent.',
        tweetUrl: '',
      };
    }

    
    const tweetResponsePromise = page.waitForResponse(
      (res) =>
        res.url().includes('/CreateTweet') && res.request().method() === 'POST',
    );

    await tweetButton.focus();
    await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="tweetButton"]');
      if (btn) {
        (btn as HTMLElement).click();
      }
    });

    const tweetRes = await tweetResponsePromise;
    const tweetData = await tweetRes.json();
    
    const tweetId =
      tweetData.data.create_tweet.tweet_results.result.rest_id ||
      tweetData.data?.id;

    const tweetUrlFull = `https://twitter.com/${twitterUsername}/status/${tweetId}`;

    post.tweetLink = tweetUrlFull;
    console.log(
      `[_postTweet] Tweet published. userId=${user.id} tweetUrl=${tweetUrlFull}`,
    );
    
    // Log partnership activity 'posted_to_twitter'
    try {
      if (!user.id) {
        console.warn(
          '[_postTweet] Cannot log partnership activity: missing user.id',
        );
      } else {
        console.log(
          `[_postTweet] Attempting to record partnership activity 'posted_to_twitter' for userId=${user.id}`,
        );
        const links = await this.partnerUserLinkRepo.find({
          where: { userId: user.id },
        });
        console.log(
          `[_postTweet] Found ${links.length} partner links for userId=${user.id}`,
        );
        for (const link of links) {
          console.log(
            `[_postTweet] Checking existing activity for partnershipId=${link.partnershipId} userId=${user.id}`,
          );
          const exists = await this.partnershipActivityRepo.findOne({
            where: {
              partnershipId: link.partnershipId,
              userId: user.id,
              activity: 'posted_to_twitter',
            },
          });
          if (exists) {
            console.log(
              `[_postTweet] Activity already exists for partnershipId=${link.partnershipId} userId=${user.id}`,
            );
            continue;
          }
          const rec = this.partnershipActivityRepo.create({
            partnershipId: link.partnershipId,
            userId: user.id,
            activity: 'posted_to_twitter',
          });
          await this.partnershipActivityRepo.save(rec);
          console.log(
            `[_postTweet] Activity created for partnershipId=${link.partnershipId} userId=${user.id}`,
          );
        }
      }
    } catch (error) {
      console.error(
        '[_postTweet] Failed to log partnership activity posted_to_twitter:',
        error?.stack || error,
      );
    }
    
    await this.postEntity.save(post);

    await page.browser().close();
    
    return {
      message: 'Tweet sent successfully',
      tweetUrl: tweetUrlFull,
    };
  }

  async downloadImageToTmp(
    imageUrl: string,
    filename?: string,
  ): Promise<string> {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
    });
    const buffer = Buffer.from(response.data, 'binary');
    const tmpFilePath = filename
      ? path.join(__dirname, '..', filename)
      : path.join(__dirname, '..', `tmp-upload-${Date.now()}.png`);
    fs.writeFileSync(tmpFilePath, buffer);
    return tmpFilePath;
  }

  private async _recoverSessionViaGmail(
    post_id: string,
    userId: number,
  ): Promise<{ message: string; tweetUrl: string }> {
    console.log(
      '[_recoverSessionViaGmail] Starting Gmail session recovery for Twitter',
    );
    // Try different browser paths
    const possiblePaths = [
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/snap/bin/chromium'
    ];
    
    // Try environment variable first, then different browser paths
    let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    
    if (!executablePath) {
      try {
        const fs = require('fs');
        for (const path of possiblePaths) {
          if (fs.existsSync(path)) {
            executablePath = path;
            break;
          }
        }
      } catch (error) {
        // Ignore error, will use bundled Chrome
      }
    }
    
    if (executablePath) {
      console.log(`[Puppeteer] Using system browser: ${executablePath}`);
    } else {
      console.log('[Puppeteer] No system browser found, using bundled Chrome');
    }

    const browser = await getBrowser();

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const GMAIL = this.configService.get<string>('GMAIL_USERNAME');
    const GMAIL_PASS = this.configService.get<string>('GMAIL_PASSWORD');

    await page.goto(
      'https://accounts.google.com/signin/v2/identifier?service=mail',
      { waitUntil: 'networkidle2' },
    );
    await page
      .type('input[type="email"]', GMAIL)
      .catch((err) => console.error('Failed to type:', err));
    await page.keyboard.press('Enter');
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await page
      .type('input[type="password"]', GMAIL_PASS)
      .catch((err) => console.error('Failed to type:', err));
    await page.keyboard.press('Enter');
    await page.waitForNavigation({ waitUntil: 'domcontentloaded' });

    await page.goto('https://mail.google.com/mail/u/0/#inbox', {
      waitUntil: 'domcontentloaded',
    });
    await new Promise((resolve) => setTimeout(resolve, 10000));

    const code = await page.evaluate(() => {
      const spans = Array.from(document.querySelectorAll('span'));
      for (const el of spans) {
        const text = el.textContent || '';
        if (/Your X confirmation code is/i.test(text)) {
          const parts = text.split(' ');
          const index = parts.findIndex((w) => w.toLowerCase() === 'is');
          if (index !== -1 && parts[index + 1]) {
            return parts[index + 1].trim();
          }
        }
      }
      return null;
    });

    if (!code) {
      throw new Error('Confirmation code not found in Gmail');
    }
    
    const CONFIRMATION_CODE_PATH = path.resolve(
      __dirname,
      '..',
      '..',
      'public',
      'twitter-confirmation-code.txt',
    );
    fs.writeFileSync(CONFIRMATION_CODE_PATH, code);

    
    await page.close();
    return await this.tweetImageViaPuppeteer(post_id, userId);
  }
}
