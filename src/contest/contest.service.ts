import { Length } from 'class-validator';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ContestEntity } from './entity/contest.entity';
import { UserEntity } from 'src/user/entities/user.entity';
import { PostEntity } from 'src/post/entities/post.entity';
import { UserService } from 'src/user/user.service';
import { CreateContestDto } from 'src/admin/dto/create-contest.dto';
import { TagEntity } from 'src/tag/entities/tag.entity';
import { ContestRunDto } from 'src/admin/dto/contest.run.dto';
import {
  ContestStatusEnum,
  ContestTypeEnum,
} from './types/contest.status.enum';
import { GetTopPostDto } from 'src/admin/dto/get-top-post.dto';
import { SetContestWinnerDto } from 'src/admin/dto/set.contest.winner.dto';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { ActivityService } from 'src/activity/activity.service';
import { ActivityEnum } from 'src/activity/types/activity.enum';
import { UpdateContestDto } from './dto/update.contest.dto';
import { RoleEnum } from 'src/user/types/role.enum';
import { FirebaseService } from 'src/firebase/firebase.service';
const axios = require('axios');
import * as https from 'https';

@Injectable()
export class ContestService {
  constructor(
    @InjectRepository(ContestEntity)
    private readonly contestRepository: Repository<ContestEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectRepository(TagEntity)
    private readonly tagRepository: Repository<TagEntity>,
    private readonly userService: UserService,
    private readonly activityService: ActivityService,
    private readonly firebaseService: FirebaseService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  async getAllContests(userId: number, type?: ContestTypeEnum) {
    let whereCondition = {};

    if (type) {
      whereCondition = { contestType: type };
    }

    const contests = await this.contestRepository.find({
      where: whereCondition,
      relations: ['winner', 'tag', 'participants'],
      order: { status: 'DESC' },
    });

    return contests.map((contest) => ({
      id: contest.id,
      name: contest.name,
      imageUrl: contest.imageUrl,
      status: contest.status,
      reward: contest.reward,
      description: contest.description,
      is_won: contest.winner?.id === userId,
      is_approved: contest.is_approved,
      contestType: contest.contestType,
      examplePrompt: contest.prompt_example,
      tag: {
        id: contest?.tag?.id,
        name: contest?.tag?.name,
      },
      is_participant: contest.participants.some(
        (participant) => participant.id === userId,
      ),
    }));
  }
  async getMyContests(userId: number) {
    const contests = await this.contestRepository
      .createQueryBuilder('contest')
      .leftJoinAndSelect('contest.participants', 'user')
      .leftJoinAndSelect('contest.tag', 'tag')
      .leftJoinAndSelect('contest.winner', 'winner')
      .select([
        'contest.id',
        'contest.name',
        'contest.imageUrl',
        'contest.status',
        'contest.reward',
        'contest.description',
        'tag.name',
        'tag.id',
        'winner.id',
      ])
      .where('user.id = :userId', { userId })
      .andWhere('contest.status = :status', { status: ContestStatusEnum.OPEN })
      .getMany();
    return contests.map((contest) => ({
      id: contest.id,
      name: contest.name,
      imageUrl: contest.imageUrl,
      status: contest.status,
      reward: contest.reward,
      description: contest.description,
      is_won: contest.winner?.id === userId,
      tag: {
        id: contest?.tag?.id,
        name: contest?.tag?.name,
      },
      is_participant: true,
    }));
  }

  async getWonContests(userId: number) {
    const contests = await this.contestRepository.find({
      where: { winner: { id: userId } },
      relations: { tag: true, participants: true },
    });

    return contests.map((contest) => ({
      id: contest.id,
      name: contest.name,
      imageUrl: contest.imageUrl,
      status: contest.status,
      reward: contest.reward,
      description: contest.description,
      is_won: true,
      tag: {
        id: contest?.tag?.id,
        name: contest?.tag?.name,
      },
      is_participant: true,
    }));
  }

  async participateInContest(contestId: number, userId: number) {
    const contest = await this.contestRepository.findOne({
      where: { id: contestId },
      relations: ['participants'],
    });

    if (!contest) {
      throw new BadRequestException('Contest not found');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (contest.participants.find((participant) => participant.id === userId)) {
      return { success: true, message: 'done' };
    }

    contest.participants.push(user);
    await this.contestRepository.save(contest);
    return { success: true, message: 'You join to contest succesfully' };
  }

  getExampleContest() {
    return {
      data: [
        {
          image_url:
            'https://res.cloudinary.com/dsypundib/image/upload/v1740997871/negr_rzp2mc.jpg',
        },
        {
          image_url:
            'https://res.cloudinary.com/dsypundib/image/upload/v1740997871/ne_negr_d2srly.jpg',
        },
        {
          image_url:
            'https://res.cloudinary.com/dsypundib/image/upload/v1740997871/girl_xak05c.jpg',
        },
      ],
    };
  }
  async getPostsByContest(
    contestId: number,
    page: number,
    limit: number,
    userId: number,
  ) {
    const offset = (page - 1) * limit;

    const contest = await this.contestRepository.findOne({
      where: { id: contestId },
      relations: ['winner'],
    });

    if (!contest) {
      throw new BadRequestException('Contest not found');
    }

    const baseQuery = `
      SELECT 
        p.id,
        p.imageUrl as image_url,
        p.createdAt as created_at,
        u.id AS user_id,
        t.id AS tag_id,
        CONCAT('#', t.name) AS tag_name,
        COUNT(l.id) AS like_count,
        CASE 
          WHEN EXISTS (SELECT 1 FROM likes WHERE postId = p.id AND userId = ${userId}) 
          THEN TRUE 
          ELSE FALSE 
        END AS is_liked,
        CASE
          WHEN EXISTS (SELECT 1 FROM viewed_posts WHERE postId = p.id AND userId = ${userId})
          THEN TRUE 
          ELSE FALSE
        END AS is_viewed
          FROM
            posts p
          LEFT JOIN
            likes l ON p.id = l.postId
          LEFT JOIN users u ON p.userId = u.id
          LEFT JOIN tags t ON p.tagId = t.id
          WHERE
            p.contestId = ? AND
            p.is_published = true
            AND p.is_blocked = false
          GROUP BY
          p.id`;

    let orderByClause = ' ORDER BY p.createdAt DESC';
    if (contest.winner) {
      orderByClause = ` ORDER BY (p.userId = ${contest.winner.id}) DESC, p.createdAt DESC`;
    }

    const rawQuery = `${baseQuery}${orderByClause} LIMIT ? OFFSET ?;`;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM (
        SELECT p.id
        FROM posts p
        WHERE p.contestId = ? AND p.is_published = true
        GROUP BY p.id
      ) AS sub`;

    const [posts, totalResult] = await Promise.all([
      this.postRepository.query(rawQuery, [contestId, limit, offset]),
      this.postRepository.query(countQuery, [contestId]),
    ]);

    const total = parseInt(totalResult[0].total, 10);
    const lastPage = Math.ceil(total / limit);

    return {
      data: posts,
      total,
      page,
      lastPage,
    };
  }

  async updateContestStatuses() {
    const currentDate = new Date();

    const contests = await this.contestRepository.find({
      relations: {
        winner: true,
        tag: true,
      },
      loadRelationIds: { relations: ['posts'], disableMixedMap: true },
    });

    if (!contests.length) return;

    const admins = await this.userRepository.find({
      where: { role: RoleEnum.ADMIN },
      select: { id: true },
    });
    const users = await this.userRepository.find({
      where: { is_deleted: false, emailVerified: true },
      relations: { deviceTokens: true },
    });

    const updatedContests = [];

    for (let contest of contests) {
      const postsCount = contest.posts.length;

      if (contest.status === ContestStatusEnum.CLOSED && contest.is_approved) {
        continue;
      }

      if (
        contest.startTime <= currentDate &&
        contest.endTime >= currentDate &&
        contest.status !== ContestStatusEnum.OPEN
      ) {
        contest.status = ContestStatusEnum.OPEN;
        await this.contestRepository.save(contest);

        const title = 'Join the contest!';
        const body = `The ${contest.name} contest is now live! Join now for a chance to win points!`;

        const notificationPromises = users.map(async (user) => {
          await this.activityService.createActivities(
            null,
            [user.id],
            ActivityEnum.CONTEST_OPEN,
            undefined,
            false,
            contest,
          );
          user.deviceTokens.map((deviceToken) =>
            this.firebaseService.sendNotification(
              deviceToken.token,
              title,
              body,
            ),
          );
          await this.notificationGateway.emitProfileUpdate(user.id.toString());
        });

        await Promise.all(notificationPromises);
        updatedContests.push(contest);
      } else if (contest.endTime < currentDate && postsCount === 0) {
        contest.status = ContestStatusEnum.CLOSED;
        contest.is_approved = true;
        updatedContests.push(contest);
      } else if (
        contest.endTime < currentDate &&
        !contest.winner &&
        postsCount > 0 &&
        contest.status !== ContestStatusEnum.PENDING_REVIEW
      ) {
        await this.activityService.createActivities(
          null,
          admins.map((e) => e.id),
          ActivityEnum.ADMIN_CONTEST_REVIEW,
          undefined,
          true,
          contest,
        );
        contest = await this.setAutomaticContestWinner(contest);
        updatedContests.push(contest);
      } else if (
        contest.endTime < currentDate &&
        contest.winner &&
        !contest.is_approved &&
        contest.status !== ContestStatusEnum.PENDING_REVIEW
      ) {
        await this.activityService.createActivities(
          null,
          admins.map((e) => e.id),
          ActivityEnum.ADMIN_CONTEST_REVIEW,
          undefined,
          true,
          contest,
        );
        contest.status = ContestStatusEnum.PENDING_REVIEW;
        updatedContests.push(contest);
      } else if (
        contest.endTime < currentDate &&
        contest.winner &&
        contest.is_approved &&
        contest.status !== ContestStatusEnum.CLOSED
      ) {
        contest.status = ContestStatusEnum.CLOSED;
        updatedContests.push(contest);
      }
    }

    if (updatedContests.length > 0) {
      users.map((user) => {
        this.notificationGateway.emitProfileUpdate(user.id.toString());
      });
      await this.contestRepository.save(updatedContests);
    }
  }

  async setAutomaticContestWinner(contest: ContestEntity) {
    if (contest.contestType === ContestTypeEnum.FINE_TUNE) {
      if (contest.tag.name) {
        try {
          const response = await axios.post(
            'https://api.tweetscout.io/v2/user-tweets',
            {
              link: 'https://x.com/y_allery',
            },
            {
              headers: {
                ApiKey: '07f21f9a-74c5-4991-91f0-030e62380d6c',
                'Content-Type': 'application/json',
                Accept: 'application/json',
              },
            },
          );

          const tweets = response.data?.tweets || [];

          const filtered = [];
          for (const t of tweets) {
            if (
              t.full_text
                .toLowerCase()
                .includes(`#${contest.tag.name.toLowerCase()}`)
            ) {
              const postId = this.extractPostIdFromTweetText(t.full_text);
              const matchedPost = postId
                ? await this.postRepository.findOne({
                    where: { id: +postId },
                    select: ['id', 'is_rejected'],
                  })
                : null;

              if (!matchedPost || !matchedPost.is_rejected) {
                filtered.push(t);
              }
            }
          }

          if (filtered.length > 0) {
            const topTweet = filtered.reduce((max, t) => {
              const score =
                t.favorite_count +
                t.retweet_count * 2 +
                t.reply_count +
                t.view_count * 0.01;
              const maxScore =
                max.favorite_count +
                max.retweet_count * 2 +
                max.reply_count +
                max.view_count * 0.01;
              return score > maxScore ? t : max;
            }, filtered[0]);

            const postId = this.extractPostIdFromTweetText(topTweet.full_text);
            const matchedPost = postId
              ? await this.postRepository.findOne({ where: { id: +postId } })
              : null;

            const match = topTweet.full_text.match(/@(\w{1,15})/);
            const twitterHandle = match ? '@' + match[1] : null;

            if (twitterHandle) {
              const user = await this.userRepository.findOne({
                where: { twitterUsername: twitterHandle },
              });

              if (user) {
                contest.winner = user;
                contest.postWinner = matchedPost || null;
                contest.is_approved = false;
                contest.status = ContestStatusEnum.PENDING_REVIEW;
                return await this.contestRepository.save(contest);
              }
            }
          }

          contest.winner = null;
          contest.postWinner = null;
          contest.is_approved = true;
          contest.status = ContestStatusEnum.CLOSED;
          return await this.contestRepository.save(contest);
        } catch (error) {
          console.error(
            'TweetScout error:',
            error.response?.data || error.message,
          );
          contest.status = ContestStatusEnum.CLOSED;
          contest.is_approved = true;
          contest.winner = null;
          contest.postWinner = null;
          return await this.contestRepository.save(contest);
        }
      }

      contest.status = ContestStatusEnum.CLOSED;
      contest.is_approved = true;
      contest.winner = null;
      contest.postWinner = null;
      return await this.contestRepository.save(contest);
    }

    const eligiblePosts = await this.postRepository
      .createQueryBuilder('post')
      .select('post.id')
      .addSelect('COUNT(like.id)', 'likeCount')
      .leftJoin('post.likes', 'like')
      .where('post.contestId = :contestId', { contestId: contest.id })
      .andWhere(
        'post.is_published = true AND post.is_blocked = false AND post.is_rejected = false',
      )
      .groupBy('post.id')
      .orderBy('likeCount', 'DESC')
      .getRawMany();

    if (eligiblePosts.length > 0) {
      const winnerPostId = eligiblePosts[0].post_id;
      const winnerPost = await this.postRepository.findOne({
        where: { id: winnerPostId },
        relations: ['user'],
      });

      if (winnerPost) {
        contest.winner = winnerPost.user;
        contest.postWinner = winnerPost;
        contest.is_approved = false;
        contest.status = ContestStatusEnum.PENDING_REVIEW;
        return await this.contestRepository.save(contest);
      }
    }

    contest.status = ContestStatusEnum.CLOSED;
    contest.is_approved = true;
    contest.winner = null;
    contest.postWinner = null;
    return await this.contestRepository.save(contest);
  }

  private extractPostIdFromTweetText(text: string): string | null {
    const match = text.match(/#(\d{1,10})\b/);
    return match ? match[1] : null;
  }

  async createAdminContest(data: CreateContestDto) {
    await this.validateTagExists(data.tag_id);
    this.validateContestTimes(data.start_time, data.end_time);
    const tag = await this.tagRepository.findOne({
      where: { id: data.tag_id },
    });
    if (!tag) throw new BadRequestException('Tag not found');

    const contest = this.contestRepository.create({
      ...data,
      tag,
      prompt_example: data.examplePrompt,
      contestType: data.fineTuneToken
        ? ContestTypeEnum.FINE_TUNE
        : ContestTypeEnum.DEFAULT,
      startTime: new Date(data.start_time),
      endTime: new Date(data.end_time),
      is_approved: false,
    });

    await this.contestRepository.save(contest);
    return {
      success: true,
      message: 'Contest created successfully',
    };
  }

  private async validateTagExists(tagId: number): Promise<void> {
    const tag = await this.tagRepository.findOne({ where: { id: tagId } });
    if (!tag) {
      throw new BadRequestException('Tag not found');
    }
  }

  private validateContestTimes(startTime: Date, endTime: Date): void {
    const currentTime = new Date();
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (start < currentTime) {
      throw new BadRequestException('Start time must be in the future');
    }
    if (end <= start) {
      throw new BadRequestException('End time must be later than start time');
    }
  }

  async forceContestRun(data: ContestRunDto) {
    const contest = await this.contestRepository.findOne({
      where: { id: data.contest_id },
    });
    if (!contest) throw new BadRequestException('Contest not found');

    contest.status = ContestStatusEnum.OPEN;
    contest.startTime = new Date();
    contest.is_approved = false;
    await this.contestRepository.save(contest);
    return {
      success: true,
      message: 'Contest run succesfully',
    };
  }

  async getPendingReviewPosts() {
    const contests = await this.contestRepository.find({
      where: {
        status: ContestStatusEnum.PENDING_REVIEW,
      },
      relations: ['tag'],
    });
    return contests;
  }

  async getTopContestPost({
    contest_id,
    page,
    limit,
  }: GetTopPostDto): Promise<any> {
    const offset = (page - 1) * limit;
    const query = `
      SELECT 
          p.id AS postId,
          p.imageUrl,
          p.userId,
          COUNT(l.id) AS likeCount
      FROM 
          posts p
      LEFT JOIN 
          likes l ON p.id = l.postId
      WHERE 
          p.contestId = ? AND
          p.is_published = 1
      GROUP BY 
          p.id
      ORDER BY 
          likeCount DESC
      LIMIT ?
      OFFSET ?;
    `;

    const result = await this.postRepository.query(query, [
      contest_id,
      +limit,
      +offset,
    ]);
    return result.length > 0 ? result : null;
  }

  async setContestWinner({ post_id, contest_id }: SetContestWinnerDto) {
    const contest = await this.contestRepository.findOne({
      where: {
        id: contest_id,
        status: ContestStatusEnum.PENDING_REVIEW,
      },
      relations: { winner: true },
    });
    if (!contest)
      throw new NotFoundException('Contest not found or already closed');

    const post = await this.postRepository.findOne({
      where: {
        id: post_id,
        is_published: true,
        is_blocked: false,
        contest: { id: contest_id },
      },
      relations: { user: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    if (contest.winner && contest.is_approved)
      throw new BadRequestException('Post already has a winner');

    if (contest.contestType === ContestTypeEnum.FINE_TUNE) {
      if (!post.user.twitterUsername) {
        throw new BadRequestException(
          'User does not have a linked Twitter username.',
        );
      }

      const retweetCheck = await this.checkRetweet(
        post.tweetLink,
        post.user.twitterUsername.replace(/^@/, ''),
      );

      if (!retweetCheck.retweet) {
        await this.rejectContestWinner({ post_id, contest_id });
        return {
          success: false,
          message:
            'User did not retweet the required tweet. Winner rejected, selecting another winner.',
        };
      }
    }

    contest.postWinner = post;
    contest.winner = post.user;
    contest.status = ContestStatusEnum.CLOSED;
    contest.is_approved = true;
    await this.contestRepository.save(contest);
    post.user.points += contest.reward;
    await this.userRepository.save(post.user);

    const description = await this.activityService.createActivities(
      null,
      [post.user.id],
      ActivityEnum.CONTEST_WIN,
      contest.reward,
      false,
      contest,
      post,
    );

    await this.activityService.createActivities(
      null,
      [post.user.id],
      ActivityEnum.ADMIN_CONTEST_WON,
      contest.reward,
      true,
      contest,
      post,
    );

    await this.activityService.deleteAdminContestActivity(contest.id);

    await this.notificationGateway.sendNotification(
      post.user.id.toString(),
      description,
      ActivityEnum.CONTEST_WIN,
    );

    await this.userService.sendPushNotificationIfEnabled(
      post.user.id,
      ActivityEnum.CONTEST_WIN,
    );

    return {
      success: true,
      message: 'Winner is set up successfully',
    };
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
        ApiKey: '07f21f9a-74c5-4991-91f0-030e62380d6c',
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

  async findAllContests(): Promise<any[]> {
    const contests = await this.contestRepository.find({
      select: ['imageUrl', 'endTime', 'reward', 'status'],
      relations: ['tag'],
    });

    const statusOrder = {
      pending_review: 1,
      open: 2,
      closed: 3,
    };

    contests.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

    return contests.map((contest) => ({
      ...contest,
              endTime: contest.endTime.toISOString().slice(0, 10),
    }));
  }

  async findContestById(id: number): Promise<ContestEntity> {
    const contest = await this.contestRepository.findOne({
      where: { id },
      relations: ['tag', 'winner', 'participants'],
    });
    if (!contest)
      throw new NotFoundException(`Contest with ID ${id} not found`);
    return contest;
  }

  async findContestsByStatus(status?: ContestStatusEnum): Promise<any[]> {
    const query = this.contestRepository
      .createQueryBuilder('contest')
      .select([
        'contest.imageUrl',
        'contest.id',
        'contest.endTime',
        'contest.reward',
        'contest.status',
        'contest.description',
        'contest.startTime',
        'tag.name AS tagName',
      ])
      .leftJoin('contest.tag', 'tag')
      .addSelect(
        `CASE 
          WHEN contest.status = 'pending_review' THEN 1
          WHEN contest.status = 'open' THEN 2
          WHEN contest.status = 'closed' THEN 3
          ELSE 4
        END`,
        'statusOrder',
      )
      .orderBy('statusOrder', 'ASC')
      .addOrderBy('contest.endTime', 'ASC');

    if (status) {
      query.where('contest.status = :status', { status });
    }

    const contests = await query.getRawMany();

    return contests.map((contest) => ({
      id: contest.contest_id,
      imageUrl: contest.contest_imageUrl,
      endTime: contest.contest_endTime?.slice(0, 10),
      startTime: contest.contest_startTime?.slice(0, 10),
      description: contest.contest_description,
      reward: contest.contest_reward,
      status: contest.contest_status,
      tag: {
        name: contest.tagName ? `#${contest.tagName}` : null,
      },
    }));
  }
  async updateContest(
    id: number,
    updateContestDto: UpdateContestDto,
  ): Promise<ContestEntity> {
    const contest = await this.contestRepository.preload({
      id: id,
      ...updateContestDto,
      startTime: updateContestDto.start_time,
      endTime: updateContestDto.end_time,
    });

    if (!contest) {
      throw new NotFoundException(`Contest with ID ${id} not found`);
    }

    if (updateContestDto.tag_id) {
      const tag = await this.tagRepository.findOne({
        where: { id: updateContestDto.tag_id },
      });
      if (!tag) {
        throw new NotFoundException(
          `Tag with ID ${updateContestDto.tag_id} not found`,
        );
      }
      contest.tag = tag;
    }

    return this.contestRepository.save(contest);
  }

  async rejectContestWinner({ post_id, contest_id }: SetContestWinnerDto) {
    const post = await this.postRepository.findOne({
      where: { id: post_id },
      relations: ['contest', 'user'],
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.contest.id !== contest_id) {
      throw new BadRequestException(
        'Post does not belong to the specified contest',
      );
    }

    post.is_rejected = true;
    await this.postRepository.save(post);

    const contest = await this.contestRepository.findOne({
      where: { id: contest_id },
      relations: ['winner', 'posts', 'posts.user', 'posts.likes', 'tag'],
    });

    if (!contest) {
      throw new NotFoundException('Contest not found');
    }

    if (contest.status === ContestStatusEnum.CLOSED) {
      throw new BadRequestException('Contest is already closed');
    }

    if (contest.winner && contest.winner.id === post.user.id) {
      const updatedContest = await this.setAutomaticContestWinner(contest);

      if (!updatedContest.winner) {
        updatedContest.status = ContestStatusEnum.CLOSED;
        updatedContest.is_approved = true;
        await this.contestRepository.save(updatedContest);
        return {
          success: true,
          message: 'Winner rejected and no new winner found. Contest closed.',
        };
      } else {
        return this.transformContestToPendingReviewResponse(updatedContest);
      }
    } else {
      const updatedContest = await this.setAutomaticContestWinner(contest);

      if (!updatedContest.winner) {
        updatedContest.status = ContestStatusEnum.CLOSED;
        updatedContest.is_approved = true;
        await this.contestRepository.save(updatedContest);
        return {
          success: true,
          message: 'Winner rejected and no new winner found. Contest closed.',
        };
      } else {
        return this.transformContestToPendingReviewResponse(updatedContest);
      }
    }
  }

  private transformContestToPendingReviewResponse(contest: ContestEntity) {
    const winningPosts = contest.posts.filter(
      (post) => post.user.id === contest.winner.id && !post.is_rejected,
    );

    winningPosts.sort((a, b) => b.likes.length - a.likes.length);

    const winnerPost = winningPosts.length > 0 ? winningPosts[0] : null;

    return {
      id: contest.id,
      name: contest.name,
      startTime: contest.startTime,
      endTime: contest.endTime,
      status: contest.status,
      winnerPost: winnerPost
        ? {
            id: winnerPost.id,
            imageUrl: winnerPost.imageUrl,
            user: {
              id: winnerPost.user.id,
              name: winnerPost.user.name,
            },
            likeCount: winnerPost.likes.length,
            isPublished: winnerPost.is_published,
            isBlocked: winnerPost.is_blocked,
            isRejected: winnerPost.is_rejected,
          }
        : null,
    };
  }

  async deleteContest(id: number): Promise<void> {
    const result = await this.contestRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Contest with ID ${id} not found`);
    }
  }
  async getTopPostForEachContest() {
    const contests = await this.contestRepository.find({
      relations: ['postWinner', 'postWinner.user'],
      where: {
        status: In([
          ContestStatusEnum.OPEN,
          ContestStatusEnum.CLOSED,
          ContestStatusEnum.PENDING_REVIEW,
        ]),
      },
    });

    const fineTuneResults = contests
      .filter(
        (c) => c.contestType === ContestTypeEnum.FINE_TUNE && c.postWinner,
      )
      .map((contest) => ({
        contestId: contest.id,
        contestName: contest.name,
        contestStatus: contest.status,
        contestIsApproved: contest.is_approved,
        post: {
          id: contest.postWinner.id,
          imageUrl: contest.postWinner.imageUrl,
          user: {
            id: contest.postWinner.user.id,
            name: contest.postWinner.user.name,
          },
          likeCount: contest.postWinner.likes?.length || 0,
          status:
            contest.status === ContestStatusEnum.CLOSED && contest.is_approved
              ? 'approved'
              : contest.status === ContestStatusEnum.PENDING_REVIEW &&
                  !contest.is_approved
                ? 'pending_review'
                : 'rejected',
        },
      }));

    const rawQuery = `
      WITH RankedPosts AS (
        SELECT 
          p.id AS post_id,
          p.imageUrl AS image_url,
          u.id AS user_id,
          u.name AS user_name,
          c.id AS contest_id,
          c.name AS contest_name,
          c.status AS contest_status,
          c.is_approved AS contest_is_approved,
          COUNT(l.id) AS like_count,
          ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY COUNT(l.id) DESC) AS rn,
          CASE 
            WHEN c.status = 'closed' AND c.is_approved = true THEN 'approved'
            WHEN c.status = 'pending_review' AND c.is_approved = false THEN 'pending_review'
            ELSE 'rejected'
          END AS post_status
        FROM 
          posts p
        JOIN users u ON p.userId = u.id
        JOIN contests c ON p.contestId = c.id
        LEFT JOIN likes l ON p.id = l.postId
        WHERE 
          p.is_rejected = false 
          AND p.is_blocked = false 
          AND p.is_published = true
          AND c.contestType != 'FINE_TUNE'
          AND c.status IN ('pending_review', 'open', 'closed')
        GROUP BY 
          p.id, u.id, c.id
      )
      SELECT
        post_id,
        image_url,
        user_id,
        user_name,
        contest_id,
        contest_name,
        contest_status,
        contest_is_approved,
        like_count,
        post_status
      FROM 
        RankedPosts
      WHERE 
        rn = 1
      ORDER BY 
        CASE 
          WHEN post_status = 'pending_review' THEN 1
          ELSE 2
        END,
        contest_id ASC;
    `;

    const regularResultsRaw = await this.postRepository.query(rawQuery);

    const regularResults = regularResultsRaw.map((winner) => ({
      contestId: winner.contest_id,
      contestName: winner.contest_name,
      contestStatus: winner.contest_status,
      contestIsApproved: !!winner.contest_is_approved,
      post: {
        id: winner.post_id,
        imageUrl: winner.image_url,
        user: {
          id: winner.user_id,
          name: winner.user_name,
        },
        likeCount: parseInt(winner.like_count, 10),
        status: winner.post_status,
      },
    }));

    return [...fineTuneResults, ...regularResults];
  }
}
