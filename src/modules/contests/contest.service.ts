import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ContestEntity } from './entity/contest.entity';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { UserService } from 'src/modules/users/user.service';
import { DeviceTokenEntity } from 'src/modules/users/entities/device-token.entity';
import { CreateContestDto } from 'src/modules/admin/dto/create-contest.dto';
import { TagEntity } from 'src/modules/catalog/tags/entities/tag.entity';
import {
  ContestStatusEnum,
  ContestTypeEnum,
} from './types/contest.status.enum';
import { SetContestWinnerDto } from 'src/modules/admin/dto/set.contest.winner.dto';
import { NotificationGateway } from 'src/modules/notifications/notification.gateway';
import { UpdateContestDto } from 'src/modules/contests/dto/update.contest.dto';
import { FirebaseService } from 'src/integrations/firebase/firebase.service';
import { RewardService } from 'src/modules/billing/rewards/reward.service';
import { RewardTypeEnum } from 'src/modules/billing/rewards/types/reward-type.enum';
import { MediaAISettingsEntity } from 'src/modules/media-generation/persistence/entities/media-ai-settings.entity';
import { UserActivityService } from 'src/modules/engagement/user-activity/services/user-activity.service';
import { UserNotificationTypeEnum } from 'src/modules/notifications/types/user-notification-type.enum';
import { AIFinetuneEntity } from 'src/modules/admin/entities/ai-finetune.entity';
import { ContestFlowService } from './contest-flow.service';
import { ContestStartNotificationQueueService } from './notifications/contest-start-notification-queue.service';
import {
  ContestLifecycleStatus,
  ContestReviewStatus,
  ContestWinnerCandidateReviewStatus,
} from './types/contest-flow.enums';
import { TwitterApiIoService } from 'src/integrations/twitter-api-io/twitter-api-io.service';

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
    @InjectRepository(MediaAISettingsEntity)
    private readonly mediaAISettingsRepository: Repository<MediaAISettingsEntity>,
    @InjectRepository(AIFinetuneEntity)
    private readonly aiFinetuneRepository: Repository<AIFinetuneEntity>,
    @InjectRepository(DeviceTokenEntity)
    private readonly deviceTokenModel: Repository<DeviceTokenEntity>,
    private readonly userService: UserService,
    private readonly userActivityService: UserActivityService,
    private readonly firebaseService: FirebaseService,
    private readonly notificationGateway: NotificationGateway,
    private readonly rewardService: RewardService,
    private readonly contestFlowService: ContestFlowService,
    private readonly twitterApiIoService: TwitterApiIoService,
    private readonly contestStartNotificationQueueService: ContestStartNotificationQueueService,
  ) {}

  async getAllContests(
    userId: number,
    type?: ContestTypeEnum,
    status?: ContestStatusEnum,
  ) {
    const whereCondition: any = {};

    if (type) {
      whereCondition.contestType = type;
    }

    if (status) {
      whereCondition.status = status;
    }

    const contests = await this.contestRepository.find({
      where: whereCondition,
      relations: ['winner', 'tag', 'mediaAiSetting'],
      order: { status: 'DESC' },
    });

    // Отримуємо список contest IDs для перевірки participants одним запитом (замість N+1)
    const contestIds = contests.map((c) => c.id);
    let participantContestIds: number[] = [];

    if (contestIds.length > 0) {
      const participantResults = await this.contestRepository
        .createQueryBuilder('contest')
        .innerJoin(
          'contest.participants',
          'participant',
          'participant.id = :userId',
          {
            userId,
          },
        )
        .where('contest.id IN (:...contestIds)', { contestIds })
        .select('contest.id', 'id')
        .getRawMany();

      participantContestIds = participantResults.map((r) => r.id);
    }

    return await Promise.all(
      contests.map((contest) =>
        this.buildContestResponse(
          contest,
          userId,
          participantContestIds.includes(contest.id),
        ),
      ),
    );
  }

  private async buildContestResponse(
    contest: ContestEntity,
    userId: number,
    isParticipant: boolean,
  ) {
    return {
      id: contest.id,
      name: contest.name,
      imageUrl: contest.imageUrl,
      status: contest.status,
      reward: contest.reward,
      description: contest.description,
      is_won: contest.winner?.id === userId,
      is_approved: contest.isApproved,
      contestType: contest.contestType,
      mediaAiService: contest.mediaAiSetting?.aiService ?? null,
      mediaCapability: contest.mediaAiSetting?.capability ?? null,
      examplePrompt: contest.promptExample,
      endTime: contest.endTime,
      tag: {
        id: contest?.tag?.id,
        name: contest?.tag?.name,
      },
      is_participant: isParticipant,
      ...(await this.contestFlowService.getContestSummary(contest.id)),
    };
  }

  async getMyContests(userId: number) {
    const contests = await this.contestRepository
      .createQueryBuilder('contest')
      .leftJoinAndSelect('contest.participants', 'user')
      .leftJoinAndSelect('contest.tag', 'tag')
      .leftJoinAndSelect('contest.winner', 'winner')
      .leftJoinAndSelect('contest.mediaAiSetting', 'mediaAiSetting')
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
        'mediaAiSetting.id',
        'mediaAiSetting.aiService',
        'mediaAiSetting.capability',
      ])
      .where('user.id = :userId', { userId })
      .getMany();
    return await Promise.all(
      contests.map(async (contest) => ({
        id: contest.id,
        name: contest.name,
        imageUrl: contest.imageUrl,
        status: contest.status,
        reward: contest.reward,
        description: contest.description,
        is_won: contest.winner?.id === userId,
        mediaAiService: contest.mediaAiSetting?.aiService ?? null,
        mediaCapability: contest.mediaAiSetting?.capability ?? null,
        tag: {
          id: contest?.tag?.id,
          name: contest?.tag?.name,
        },
        is_participant: true,
        ...(await this.contestFlowService.getContestSummary(contest.id)),
      })),
    );
  }

  async getWonContests(userId: number) {
    const contests = await this.contestRepository.find({
      where: { winner: { id: userId } },
      relations: { tag: true, participants: true, mediaAiSetting: true },
    });

    return await Promise.all(
      contests.map(async (contest) => ({
        id: contest.id,
        name: contest.name,
        imageUrl: contest.imageUrl,
        status: contest.status,
        reward: contest.reward,
        description: contest.description,
        is_won: true,
        mediaAiService: contest.mediaAiSetting?.aiService ?? null,
        mediaCapability: contest.mediaAiSetting?.capability ?? null,
        tag: {
          id: contest?.tag?.id,
          name: contest?.tag?.name,
        },
        is_participant: true,
        ...(await this.contestFlowService.getContestSummary(contest.id)),
      })),
    );
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

    if (contest.status !== ContestStatusEnum.OPEN) {
      throw new BadRequestException('Contest is not open for participation');
    }

    const now = new Date();
    if (now < contest.startTime) {
      throw new BadRequestException('Contest has not started yet');
    }

    if (now > contest.endTime) {
      throw new BadRequestException('Contest has already ended');
    }

    contest.participants.push(user);
    await this.contestRepository.save(contest);

    // Відмічаємо eligibility для одноразового реварду "участь у контесті"
    await this.rewardService.markRewardEligible(
      userId,
      RewardTypeEnum.CONTEST_PARTICIPATION,
    );

    return { success: true, message: 'You join to contest succesfully' };
  }

  getExampleContest() {
    return {
      data: [
        {
          id: -1,
          imageUrl:
            'https://yallery-api-prod.org/media/image/upload/legacy_dsypundib/image/b198db03-57e5-4543-a056-9ab3970b383a.png',
          videoUrl: null,
          previewImageUrl: null,
          createdAt: null,
          userId: null,
          username: null,
          tagId: null,
          tagName: null,
          likeCount: 0,
          viewCount: 0,
          isLiked: false,
          isViewed: false,
          isPublished: true,
          generationParams: null,
        },
        {
          id: -2,
          imageUrl:
            'https://yallery-api-prod.org/media/image/upload/legacy_dsypundib/image/f90e08b9-edc7-42a3-9b80-8e73f590fc7c.png',
          videoUrl: null,
          previewImageUrl: null,
          createdAt: null,
          userId: null,
          username: null,
          tagId: null,
          tagName: null,
          likeCount: 0,
          viewCount: 0,
          isLiked: false,
          isViewed: false,
          isPublished: true,
          generationParams: null,
        },
        {
          id: -3,
          imageUrl:
            'https://yallery-api-prod.org/media/image/upload/legacy_dsypundib/image/a3170033-3cf8-4af9-a5f7-b6c6c175dd95.png',
          videoUrl: null,
          previewImageUrl: null,
          createdAt: null,
          userId: null,
          username: null,
          tagId: null,
          tagName: null,
          likeCount: 0,
          viewCount: 0,
          isLiked: false,
          isViewed: false,
          isPublished: true,
          generationParams: null,
        },
      ],
      total: 3,
      page: 1,
      lastPage: 1,
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

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM posts p
      WHERE p.contestId = ? AND p.isPublished = true
        AND p.isBlocked = false
        AND p.isRejected = false`;

    let idsOrderClause = ' ORDER BY p.createdAt DESC';
    const idsQueryParams: any[] = [contestId];
    if (contest.winner) {
      idsOrderClause = ' ORDER BY (p.userId = ?) DESC, p.createdAt DESC';
      idsQueryParams.push(contest.winner.id);
    }
    idsQueryParams.push(limit, offset);

    const idsQuery = `
      SELECT p.id FROM posts p
      WHERE p.contestId = ? AND p.isPublished = true
        AND p.isBlocked = false
        AND p.isRejected = false
      ${idsOrderClause}
      LIMIT ? OFFSET ?`;

    const [idRows, totalResult] = await Promise.all([
      this.postRepository.query(idsQuery, idsQueryParams),
      this.postRepository.query(countQuery, [contestId]),
    ]);

    const total = parseInt(totalResult[0].total, 10);
    const lastPage = Math.ceil(total / limit);

    if (idRows.length === 0) {
      return { data: [], total, page, lastPage };
    }

    const ids = idRows.map((r: { id: number }) => r.id);
    const placeholders = ids.map(() => '?').join(',');

    const dataQuery = `
      SELECT
        p.id AS id,
        p.imageUrl AS imageUrl,
        p.videoUrl AS videoUrl,
        p.previewImageUrl AS previewImageUrl,
        p.createdAt AS createdAt,
        u.id AS userId,
        u.nickname AS username,
        t.id AS tagId,
        CONCAT('#', t.name) AS tagName,
        (SELECT COUNT(*) FROM likes WHERE postId = p.id) AS likeCount,
        (SELECT COUNT(*) FROM viewed_posts WHERE postId = p.id) AS viewCount,
        CASE
          WHEN EXISTS (SELECT 1 FROM likes WHERE postId = p.id AND userId = ?)
          THEN TRUE
          ELSE FALSE
        END AS isLiked,
        CASE
          WHEN EXISTS (SELECT 1 FROM viewed_posts WHERE postId = p.id AND userId = ?)
          THEN TRUE
          ELSE FALSE
        END AS isViewed,
        p.generationParams AS generationParams,
        p.isPublished AS isPublished
      FROM posts p
      LEFT JOIN users u ON p.userId = u.id
      LEFT JOIN tags t ON p.tagId = t.id
      WHERE p.id IN (${placeholders})
      ORDER BY CASE ${ids.map((id: number, i: number) => `WHEN p.id = ${id} THEN ${i}`).join(' ')} END`;

    const dataParams = [userId, userId, ...ids];
    const posts = await this.postRepository.query(dataQuery, dataParams);

    const normalizedPosts = posts.map((post: any) => ({
      ...post,
      generationParams: this.normalizeGenerationParams(post.generationParams),
    }));

    return {
      data: normalizedPosts,
      total,
      page,
      lastPage,
    };
  }

  private normalizeGenerationParams(params: any): any {
    if (
      !params ||
      typeof params !== 'object' ||
      Object.keys(params).length === 0
    ) {
      return {
        prompt: 'Unknown',
        ai_service: 'flux',
        orientation: 'vertical',
      };
    }

    return {
      prompt: params.prompt || 'Unknown',
      ai_service: params.ai_service || 'flux',
      orientation: params.orientation || 'vertical',
      style_id: params.style_id,
      color_id: params.color_id,
      width: params.width,
      height: params.height,
      negative_prompt: params.negative_prompt,
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

    if (!contests.length) {
      return;
    }

    const updatedContests = [];

    for (let contest of contests) {
      try {
        const v2Result =
          await this.contestFlowService.advanceContestLifecycle(contest);
        if (v2Result.handled) {
          if (v2Result.opened) {
            await this.contestStartNotificationQueueService.enqueueContestStarted(
              contest,
            );
          }
          continue;
        }

        const postsCount = await this.postRepository.count({
          where: {
            contest: { id: contest.id },
            isPublished: true,
            isBlocked: false,
            isRejected: false,
          },
        });

        if (contest.status === ContestStatusEnum.CLOSED && contest.isApproved) {
          continue;
        }

        if (
          contest.startTime > currentDate &&
          !contest.winner &&
          !contest.isApproved &&
          contest.status !== ContestStatusEnum.UPCOMING
        ) {
          // Scheduled but not started: make "starts soon" explicit instead of
          // reusing CLOSED (which also means "finished").
          contest.status = ContestStatusEnum.UPCOMING;
          updatedContests.push(contest);
        } else if (
          contest.startTime <= currentDate &&
          contest.endTime >= currentDate &&
          contest.status !== ContestStatusEnum.OPEN
        ) {
          contest.status = ContestStatusEnum.OPEN;
          await this.contestRepository.save(contest);

          await this.contestStartNotificationQueueService.enqueueContestStarted(
            contest,
          );

          updatedContests.push(contest);
        } else if (contest.endTime < currentDate && postsCount === 0) {
          contest.status = ContestStatusEnum.CLOSED;
          contest.isApproved = true;
          updatedContests.push(contest);
        } else if (
          contest.endTime < currentDate &&
          !contest.winner &&
          postsCount > 0 &&
          contest.status !== ContestStatusEnum.PENDING_REVIEW
        ) {
          contest = await this.setAutomaticContestWinner(contest);
          updatedContests.push(contest);
        } else if (
          contest.endTime < currentDate &&
          contest.winner &&
          !contest.isApproved &&
          contest.status !== ContestStatusEnum.PENDING_REVIEW
        ) {
          contest.status = ContestStatusEnum.PENDING_REVIEW;
          updatedContests.push(contest);
        } else if (
          contest.endTime < currentDate &&
          contest.winner &&
          contest.isApproved &&
          contest.status !== ContestStatusEnum.CLOSED
        ) {
          contest.status = ContestStatusEnum.CLOSED;
          updatedContests.push(contest);
        }
      } catch (error) {
        console.error(
          `❌ Error processing contest ${contest.id}:`,
          error.message,
        );
        continue;
      }
    }

    if (updatedContests.length > 0) {
      await this.contestRepository.save(updatedContests);

      const participantUserIds = new Set<number>();
      updatedContests.forEach((contest) => {
        if (contest.participants) {
          contest.participants.forEach((participant) => {
            participantUserIds.add(participant.id);
          });
        }
      });

      participantUserIds.forEach((userId) => {
        this.notificationGateway.emitProfileUpdate(userId.toString());
      });
    }
  }

  async setAutomaticContestWinner(contest: ContestEntity) {
    // Starting automatic winner selection for contest "${contest.name}" (ID: ${contest.id})
    if (contest.contestType === ContestTypeEnum.FINE_TUNE) {
      // Contest type: FINE_TUNE, Tag: ${contest.tag.name}

      if (contest.tag.name) {
        try {
          const query = `from:y_allery #${contest.tag.name}`;
          const response = await this.twitterApiIoService.searchTweets(
            query,
            'Latest',
            this.toUnixSeconds(contest.startTime),
            this.toUnixSeconds(contest.endTime),
          );

          const tweets = response?.tweets || [];

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
                    select: ['id', 'isRejected'],
                  })
                : null;

              if (!matchedPost || !matchedPost.isRejected) {
                filtered.push(t);
              }
            }
          }
          // Filtered tweets count for tag #${contest.tag.name}

          if (filtered.length > 0) {
            // Selecting winner from valid tweets
            const topTweet = filtered.reduce((max, t) => {
              const score = this.getTweetEngagementScore(t);
              const maxScore = this.getTweetEngagementScore(max);
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
                contest.isApproved = false;
                contest.status = ContestStatusEnum.PENDING_REVIEW;
                const savedContest = await this.contestRepository.save(contest);
                return savedContest;
              } else {
                // No user found with this twitter handle
              }
            } else {
              // No twitter handle found in top tweet
            }
          }

          contest.winner = null;
          contest.postWinner = null;
          contest.isApproved = true;
          contest.status = ContestStatusEnum.CLOSED;
          const savedContest = await this.contestRepository.save(contest);
          return savedContest;
        } catch (error) {
          console.error(
            `   ❌ Error in automatic winner selection:`,
            error.message,
          );
          console.error(
            'TwitterAPI.io error:',
            error.response?.data || error.message,
          );
          // Error occurred - closing contest without winner
          contest.status = ContestStatusEnum.CLOSED;
          contest.isApproved = true;
          contest.winner = null;
          contest.postWinner = null;
          const savedContest = await this.contestRepository.save(contest);
          // Contest closed due to error - status: CLOSED
          return savedContest;
        }
      } else {
        // No tag name provided for FINE_TUNE contest
      }

      // Contest type is not FINE_TUNE or no tag - closing without winner
      contest.status = ContestStatusEnum.CLOSED;
      contest.isApproved = true;
      contest.winner = null;
      contest.postWinner = null;
      const savedContest = await this.contestRepository.save(contest);
      // Contest closed - status: CLOSED
      return savedContest;
    }

    // Contest type: DEFAULT - selecting winner by likes

    const eligiblePosts = await this.postRepository
      .createQueryBuilder('post')
      .select('post.id')
      .addSelect('COUNT(like.id)', 'likeCount')
      .leftJoin('post.likes', 'like')
      .where('post.contestId = :contestId', { contestId: contest.id })
      .andWhere(
        'post.isPublished = true AND post.isBlocked = false AND post.isRejected = false',
      )
      .groupBy('post.id')
      .orderBy('likeCount', 'DESC')
      .getRawMany();

    // Found eligible posts for contest

    if (eligiblePosts.length > 0) {
      const winnerPostId = eligiblePosts[0].post_id;
      const winnerPost = await this.postRepository.findOne({
        where: { id: winnerPostId },
        relations: ['user'],
      });

      if (winnerPost) {
        contest.winner = winnerPost.user;
        contest.postWinner = winnerPost;
        contest.isApproved = false;
        contest.status = ContestStatusEnum.PENDING_REVIEW;
        const savedContest = await this.contestRepository.save(contest);
        return savedContest;
      } else {
        // Winner post not found in database
      }
    } else {
      // No eligible posts found for contest
    }

    contest.status = ContestStatusEnum.CLOSED;
    contest.isApproved = true;
    contest.winner = null;
    contest.postWinner = null;
    const savedContest = await this.contestRepository.save(contest);
    return savedContest;
  }

  private extractPostIdFromTweetText(text: string): string | null {
    const match = text.match(/#(\d{1,10})\b/);
    return match ? match[1] : null;
  }

  private extractTweetIdFromLink(tweetLink: string): string | null {
    const match = tweetLink?.match(/status\/(\d+)/);
    return match?.[1] || null;
  }

  async createAdminContest(data: CreateContestDto) {
    await this.validateTagExists(data.tag_id);
    this.validateContestTimes(data.start_time, data.end_time);
    const tag = await this.tagRepository.findOne({
      where: { id: data.tag_id },
    });
    if (!tag) throw new BadRequestException('Tag not found');

    const requestedContestType = this.normalizeCreateContestType(
      data.contestType,
    );
    const readyFineTune = data.fineTuneId
      ? await this.getReadyFineTuneById(data.fineTuneId)
      : null;
    const fineTuneToken =
      readyFineTune?.loraKey ?? data.fineTuneToken?.trim() ?? null;
    const fineTuneTriggerWord =
      data.fineTuneTriggerWord?.trim() ?? readyFineTune?.triggerWord ?? null;
    const fineTuneStrength =
      data.fineTuneStrength ??
      readyFineTune?.generationDefaults?.loraScale ??
      1;
    const mediaAiSetting = await this.resolveContestMediaAiSettingForAdmin({
      mediaAiSettingId: data.media_ai_setting_id ?? null,
      fineTuneToken:
        requestedContestType === ContestTypeEnum.FINE_TUNE || fineTuneToken
          ? fineTuneToken
          : null,
    });
    const contestType =
      requestedContestType ??
      this.resolveContestType(fineTuneToken, mediaAiSetting?.aiService ?? null);

    if (contestType === ContestTypeEnum.FINE_TUNE) {
      await this.assertReadyFineTune(fineTuneToken);
    }

    const socialPostSettings = {
      postToTwitter: data.socialPostSettings?.postToTwitter ?? false,
      postToInstagram: data.socialPostSettings?.postToInstagram ?? false,
    };

    const contest = this.contestRepository.create({
      ...data,
      tag,
      mediaAiSetting,
      promptExample: data.examplePrompt,
      // Status is time-driven; a new contest always starts in the future.
      status: ContestStatusEnum.UPCOMING,
      contestType,
      fineTuneToken:
        contestType === ContestTypeEnum.FINE_TUNE ? fineTuneToken : null,
      fineTuneTriggerWord:
        contestType === ContestTypeEnum.FINE_TUNE ? fineTuneTriggerWord : null,
      fineTuneStrength:
        contestType === ContestTypeEnum.FINE_TUNE ? fineTuneStrength : null,
      startTime: new Date(data.start_time),
      endTime: new Date(data.end_time),
      isApproved: false,
      socialPostSettings,
    });

    const savedContest = await this.contestRepository.save(contest);
    await this.contestFlowService.createMetadataForContest(savedContest);
    return {
      success: true,
      message: 'Contest created successfully',
      contestId: savedContest.id,
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

  private async resolveContestMediaAiSettingForAdmin(params: {
    mediaAiSettingId?: number | null;
    fineTuneToken?: string | null;
  }): Promise<MediaAISettingsEntity | null> {
    const fineTuneToken = params.fineTuneToken?.trim();

    if (fineTuneToken) {
      if (params.mediaAiSettingId != null) {
        const explicitSetting = await this.getActiveMediaAiSettingById(
          params.mediaAiSettingId,
        );
        if (explicitSetting.aiService !== 'sdxl_lora_generation') {
          throw new BadRequestException(
            'Fine-tune contests must use the sdxl_lora_generation media model.',
          );
        }
        return explicitSetting;
      }

      return this.getActiveMediaAiSettingByAiService('sdxl_lora_generation');
    }

    if (params.mediaAiSettingId != null) {
      const explicitSetting = await this.getActiveMediaAiSettingById(
        params.mediaAiSettingId,
      );
      if (explicitSetting.aiService === 'sdxl_lora_generation') {
        throw new BadRequestException(
          `${explicitSetting.aiService} requires fineTuneToken to be configured.`,
        );
      }
      return null;
    }

    return null;
  }

  private async getActiveMediaAiSettingById(
    mediaAiSettingId: number,
  ): Promise<MediaAISettingsEntity> {
    const mediaAiSetting = await this.mediaAISettingsRepository.findOne({
      where: {
        id: mediaAiSettingId,
        isActive: true,
      },
    });

    if (!mediaAiSetting) {
      throw new BadRequestException(
        `Media AI setting with ID ${mediaAiSettingId} not found.`,
      );
    }

    return mediaAiSetting;
  }

  private async getActiveMediaAiSettingByAiService(
    aiService: string,
  ): Promise<MediaAISettingsEntity> {
    const mediaAiSetting = await this.mediaAISettingsRepository.findOne({
      where: {
        aiService,
        isActive: true,
      },
    });

    if (!mediaAiSetting) {
      throw new BadRequestException(
        `Media AI setting ${aiService} is not configured.`,
      );
    }

    return mediaAiSetting;
  }

  private resolveContestType(
    fineTuneToken: string | null,
    mediaAiService: string | null,
  ): ContestTypeEnum {
    return fineTuneToken || mediaAiService === 'sdxl_lora_generation'
      ? ContestTypeEnum.FINE_TUNE
      : ContestTypeEnum.DEFAULT;
  }

  private normalizeCreateContestType(
    contestType?: CreateContestDto['contestType'] | null,
  ): ContestTypeEnum | null {
    if (!contestType) {
      return null;
    }

    if (
      contestType === 'fine_tune' ||
      contestType === ContestTypeEnum.FINE_TUNE
    ) {
      return ContestTypeEnum.FINE_TUNE;
    }

    if (contestType === 'standard' || contestType === ContestTypeEnum.DEFAULT) {
      return ContestTypeEnum.DEFAULT;
    }

    throw new BadRequestException(`Unsupported contestType: ${contestType}`);
  }

  private async getReadyFineTuneById(
    fineTuneId: number,
  ): Promise<AIFinetuneEntity> {
    const fineTune = await this.aiFinetuneRepository.findOne({
      where: { id: fineTuneId },
    });

    if (!fineTune || fineTune.status !== 'ready' || !fineTune.loraUrl) {
      throw new BadRequestException(
        'Fine-tune contests require a ready LoRA training profile.',
      );
    }

    return fineTune;
  }

  private async assertReadyFineTune(
    fineTuneToken?: string | null,
  ): Promise<AIFinetuneEntity> {
    const loraKey = fineTuneToken?.trim();
    if (!loraKey) {
      throw new BadRequestException(
        'Fine-tune contests require fineTuneToken.',
      );
    }

    const fineTune = await this.aiFinetuneRepository.findOne({
      where: { loraKey },
    });

    if (!fineTune || fineTune.status !== 'ready' || !fineTune.loraUrl) {
      throw new BadRequestException(
        'Fine-tune contests require a ready LoRA training profile.',
      );
    }

    return fineTune;
  }

  async setContestWinner({ post_id, contest_id }: SetContestWinnerDto) {
    if (await this.contestFlowService.isV2Contest(contest_id)) {
      const candidates = await this.contestFlowService.getReviewQueue();
      const contestReview = candidates.find(
        (item) => item.contestId === contest_id,
      );
      const candidate = contestReview?.candidates.find(
        (item) => item.post?.id === post_id,
      );
      if (!candidate) {
        throw new NotFoundException('Winner candidate not found');
      }
      return this.contestFlowService.approveCandidate(contest_id, candidate.id);
    }

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
        isPublished: true,
        isBlocked: false,
        contest: { id: contest_id },
      },
      relations: { user: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    if (contest.winner && contest.isApproved)
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

    // Atomically claim the win + pay the prize in one transaction. The state
    // transition itself is the idempotency gate: only the request that flips a
    // still-PENDING_REVIEW / not-yet-approved contest to CLOSED pays out, so two
    // concurrent admin requests (or a retry) can't double-pay. Prize is credited
    // via atomic increment instead of read-modify-write save. (Mirrors the V2
    // approveCandidate path's transactional, single-payout guarantee.)
    const claimed = await this.contestRepository.manager.transaction(
      async (manager) => {
        const claim = await manager
          .getRepository(ContestEntity)
          .createQueryBuilder()
          .update(ContestEntity)
          .set({
            postWinner: { id: post.id },
            winner: { id: post.user.id },
            status: ContestStatusEnum.CLOSED,
            isApproved: true,
          })
          .where('id = :cid', { cid: contest.id })
          .andWhere('status = :pending', {
            pending: ContestStatusEnum.PENDING_REVIEW,
          })
          .andWhere('isApproved = :approved', { approved: false })
          .execute();

        if (!claim.affected) {
          return false;
        }

        await manager
          .getRepository(UserEntity)
          .increment({ id: post.user.id }, 'points', contest.reward);
        return true;
      },
    );

    if (!claimed) {
      throw new BadRequestException('Post already has a winner');
    }

    await this.userActivityService.logContestWon({
      userId: post.user.id,
      contestId: contest.id,
      contestName: contest.name,
      reward: contest.reward,
      postId: post.id,
      previewUrl:
        post.imageUrl ?? post.previewImageUrl ?? contest.imageUrl ?? null,
    });

    await this.userService.sendPushNotificationIfEnabled(
      post.user.id,
      UserNotificationTypeEnum.CONTEST_WIN,
    );
    await this.notificationGateway.emitProfileUpdate(post.user.id.toString());

    return {
      success: true,
      message: 'Winner is set up successfully',
    };
  }

  private async checkRetweet(
    tweetLink: string,
    userHandle: string,
  ): Promise<{ retweet: boolean }> {
    const tweetId = this.extractTweetIdFromLink(tweetLink);
    if (!tweetId) {
      return { retweet: false };
    }

    try {
      return await this.twitterApiIoService.verifyUserRetweeted(
        tweetId,
        userHandle,
      );
    } catch {
      return { retweet: false };
    }
  }

  private toUnixSeconds(date?: Date | string | null): number | undefined {
    if (!date) return undefined;
    const time = new Date(date).getTime();
    if (!Number.isFinite(time)) return undefined;
    return Math.floor(time / 1000);
  }

  private getTweetEngagementScore(tweet: any): number {
    return (
      Number(tweet?.favorite_count || tweet?.likeCount || 0) +
      Number(tweet?.retweet_count || tweet?.retweetCount || 0) * 2 +
      Number(tweet?.reply_count || tweet?.replyCount || 0) +
      Number(tweet?.view_count || tweet?.viewCount || 0) * 0.01
    );
  }

  async findContestById(
    id: number,
  ): Promise<ContestEntity & Record<string, any>> {
    const contest = await this.contestRepository.findOne({
      where: { id },
      relations: ['tag', 'winner', 'participants', 'mediaAiSetting'],
    });
    if (!contest)
      throw new NotFoundException(`Contest with ID ${id} not found`);
    return Object.assign(
      contest,
      await this.contestFlowService.getContestSummary(id),
    );
  }

  async getContestById(id: number, userId: number) {
    const contest = await this.contestRepository.findOne({
      where: { id },
      relations: ['tag', 'winner', 'participants', 'mediaAiSetting'],
    });

    if (!contest) {
      throw new NotFoundException(`Contest with ID ${id} not found`);
    }

    const isParticipant =
      contest.participants?.some((participant) => participant.id === userId) ??
      false;

    return this.buildContestResponse(contest, userId, isParticipant);
  }

  async findContestsByStatus(status?: ContestStatusEnum): Promise<any[]> {
    const query = this.contestRepository
      .createQueryBuilder('contest')
      .select([
        'contest.imageUrl',
        'contest.id',
        'contest.name',
        'contest.endTime AS end_time',
        'contest.reward',
        'contest.status',
        'contest.description',
        'contest.startTime AS start_time',
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

    if (contests.length > 0) {
      // Raw contest data debug removed
    }

    return await Promise.all(
      contests.map(async (contest) => ({
        id: contest.contest_id,
        name: contest.contest_name,
        imageUrl: contest.contest_imageUrl,
        endTime: contest.end_time,
        startTime: contest.start_time,
        description: contest.contest_description,
        reward: contest.contest_reward,
        status: contest.contest_status,
        tag: {
          name: contest.tagName ? `#${contest.tagName}` : null,
        },
        ...(await this.contestFlowService.getContestSummary(
          contest.contest_id,
        )),
      })),
    );
  }
  async updateContest(
    id: number,
    updateContestDto: UpdateContestDto,
  ): Promise<ContestEntity> {
    const contest = await this.contestRepository.findOne({
      where: { id },
      relations: {
        mediaAiSetting: true,
        tag: true,
      },
    });

    if (!contest) {
      throw new NotFoundException(`Contest with ID ${id} not found`);
    }

    if (updateContestDto.name !== undefined) {
      contest.name = updateContestDto.name;
    }
    if (updateContestDto.imageUrl !== undefined) {
      contest.imageUrl = updateContestDto.imageUrl;
    }
    if (updateContestDto.description !== undefined) {
      contest.description = updateContestDto.description;
    }
    if (updateContestDto.reward !== undefined) {
      contest.reward = updateContestDto.reward;
    }
    if (updateContestDto.status !== undefined) {
      contest.status = updateContestDto.status;
    }
    if (updateContestDto.start_time !== undefined) {
      contest.startTime = new Date(updateContestDto.start_time);
    }
    if (updateContestDto.end_time !== undefined) {
      contest.endTime = new Date(updateContestDto.end_time);
    }
    if (updateContestDto.fineTuneToken !== undefined) {
      contest.fineTuneToken = updateContestDto.fineTuneToken;
    }
    if (updateContestDto.fineTuneTriggerWord !== undefined) {
      contest.fineTuneTriggerWord = updateContestDto.fineTuneTriggerWord;
    }
    if (updateContestDto.fineTuneStrength !== undefined) {
      contest.fineTuneStrength = updateContestDto.fineTuneStrength;
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

    if (updateContestDto.socialPostSettings !== undefined) {
      contest.socialPostSettings = {
        postToTwitter:
          updateContestDto.socialPostSettings.postToTwitter ?? false,
        postToInstagram:
          updateContestDto.socialPostSettings.postToInstagram ?? false,
      };
    }

    if (
      updateContestDto.media_ai_setting_id !== undefined ||
      updateContestDto.fineTuneToken !== undefined
    ) {
      const mediaAiSetting = await this.resolveContestMediaAiSettingForAdmin({
        mediaAiSettingId:
          updateContestDto.media_ai_setting_id ??
          contest.mediaAiSetting?.id ??
          null,
        fineTuneToken: contest.fineTuneToken ?? null,
      });

      contest.mediaAiSetting = mediaAiSetting;
      contest.contestType = this.resolveContestType(
        contest.fineTuneToken ?? null,
        mediaAiSetting?.aiService ?? null,
      );
      if (contest.contestType === ContestTypeEnum.FINE_TUNE) {
        await this.assertReadyFineTune(contest.fineTuneToken);
      }
    }

    const savedContest = await this.contestRepository.save(contest);
    if (savedContest.status === ContestStatusEnum.OPEN) {
      await this.contestFlowService.setLifecycleStatus(
        savedContest.id,
        ContestLifecycleStatus.RUNNING,
        ContestReviewStatus.NONE,
      );
    }
    return savedContest;
  }

  async rejectContestWinner({ post_id, contest_id }: SetContestWinnerDto) {
    if (await this.contestFlowService.isV2Contest(contest_id)) {
      const candidates = await this.contestFlowService.getReviewQueue();
      const contestReview = candidates.find(
        (item) => item.contestId === contest_id,
      );
      const candidate = contestReview?.candidates.find(
        (item) => item.post?.id === post_id,
      );
      if (!candidate) {
        throw new NotFoundException('Winner candidate not found');
      }
      return this.contestFlowService.rejectCandidate(contest_id, candidate.id);
    }

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

    post.isRejected = true;
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

    // Rejecting the current winner and rejecting any other post both re-run
    // automatic winner selection identically, so there is no branching here.
    const updatedContest = await this.setAutomaticContestWinner(contest);

    if (!updatedContest.winner) {
      updatedContest.status = ContestStatusEnum.CLOSED;
      updatedContest.isApproved = true;
      await this.contestRepository.save(updatedContest);
      return {
        success: true,
        message: 'Winner rejected and no new winner found. Contest closed.',
      };
    }

    return this.transformContestToPendingReviewResponse(updatedContest);
  }

  private transformContestToPendingReviewResponse(contest: ContestEntity) {
    const winningPosts = contest.posts.filter(
      (post) => post.user.id === contest.winner.id && !post.isRejected,
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
            isPublished: winnerPost.isPublished,
            isBlocked: winnerPost.isBlocked,
            isRejected: winnerPost.isRejected,
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
    const v2ReviewQueue = await this.contestFlowService.getReviewQueue();
    const v2Results = v2ReviewQueue
      .map((contestReview) => {
        const currentCandidate =
          contestReview.candidates.find(
            (candidate) =>
              candidate.reviewStatus ===
                ContestWinnerCandidateReviewStatus.SELECTED ||
              candidate.reviewStatus ===
                ContestWinnerCandidateReviewStatus.APPROVED,
          ) ?? contestReview.candidates[0];

        if (!currentCandidate?.post) {
          return null;
        }

        return {
          contestId: contestReview.contestId,
          contestName: contestReview.contestName,
          contestStatus:
            contestReview.reviewStatus === ContestReviewStatus.APPROVED
              ? ContestStatusEnum.CLOSED
              : ContestStatusEnum.PENDING_REVIEW,
          contestIsApproved:
            contestReview.reviewStatus === ContestReviewStatus.APPROVED,
          lifecycleStatus: contestReview.lifecycleStatus,
          reviewStatus: contestReview.reviewStatus,
          post: {
            id: currentCandidate.post.id,
            imageUrl:
              currentCandidate.post.imageUrl ??
              currentCandidate.post.previewImageUrl,
            videoUrl: currentCandidate.post.videoUrl,
            previewImageUrl: currentCandidate.post.previewImageUrl,
            user: currentCandidate.post.user,
            likeCount: currentCandidate.scoreBreakdown?.likes ?? 0,
            score: currentCandidate.score,
            scoreBreakdown: currentCandidate.scoreBreakdown,
            eligibilityStatus: currentCandidate.eligibilityStatus,
            status:
              currentCandidate.reviewStatus ===
              ContestWinnerCandidateReviewStatus.APPROVED
                ? 'approved'
                : currentCandidate.reviewStatus ===
                    ContestWinnerCandidateReviewStatus.REJECTED
                  ? 'rejected'
                  : 'pending_review',
          },
        };
      })
      .filter(Boolean);

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
        contestIsApproved: contest.isApproved,
        post: {
          id: contest.postWinner.id,
          imageUrl: contest.postWinner.imageUrl,
          user: {
            id: contest.postWinner.user.id,
            name: contest.postWinner.user.name,
          },
          likeCount: contest.postWinner.likes?.length || 0,
          status:
            contest.status === ContestStatusEnum.CLOSED && contest.isApproved
              ? 'approved'
              : contest.status === ContestStatusEnum.PENDING_REVIEW &&
                  !contest.isApproved
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
          c.isApproved AS contest_is_approved,
          COUNT(l.id) AS like_count,
          ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY COUNT(l.id) DESC) AS rn,
          CASE 
            WHEN c.status = 'closed' AND c.isApproved = true THEN 'approved'
            WHEN c.status = 'pending_review' AND c.isApproved = false THEN 'pending_review'
            ELSE 'rejected'
          END AS post_status
        FROM 
          posts p
        JOIN users u ON p.userId = u.id
        JOIN contests c ON p.contestId = c.id
        LEFT JOIN likes l ON p.id = l.postId
        WHERE 
          p.isRejected = false 
          AND p.isBlocked = false 
          AND p.isPublished = true
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

    return [...v2Results, ...fineTuneResults, ...regularResults];
  }
}
