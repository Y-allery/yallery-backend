import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { MediaAISettingsEntity } from 'src/modules/media-generation/persistence/entities/media-ai-settings.entity';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { RewardService } from 'src/modules/billing/rewards/reward.service';
import { RewardTypeEnum } from 'src/modules/billing/rewards/types/reward-type.enum';
import { UserActivityService } from 'src/modules/engagement/user-activity/services/user-activity.service';
import { UserEntity } from 'src/modules/users/entities/user.entity';
import { NotificationGateway } from 'src/modules/notifications/notification.gateway';
import { ContestEntity } from './entity/contest.entity';
import { ContestFlowMetadataEntity } from './entity/contest-flow-metadata.entity';
import { ContestReviewActionEntity } from './entity/contest-review-action.entity';
import { ContestRewardEntity } from './entity/contest-reward.entity';
import { ContestSubmissionEntity } from './entity/contest-submission.entity';
import { ContestWinnerCandidateEntity } from './entity/contest-winner-candidate.entity';
import {
  ContestLifecycleStatus,
  ContestReviewActionType,
  ContestReviewStatus,
  ContestRewardStatus,
  ContestSubmissionEligibilityStatus,
  ContestSubmissionStatus,
  ContestVisibility,
  ContestWinnerCandidateReviewStatus,
  ContestWinnerCandidateSource,
} from './types/contest-flow.enums';
import {
  ContestStatusEnum,
  ContestTypeEnum,
} from './types/contest.status.enum';
import { TwitterApiIoService } from 'src/integrations/twitter-api-io/twitter-api-io.service';

type StartSubmissionParams = {
  contestId?: number | null;
  userId: number;
  mediaKind: 'image' | 'video' | 'audio';
  aiService: string;
  capability: string;
};

type LifecycleAdvanceResult = {
  handled: boolean;
  opened?: boolean;
};

@Injectable()
export class ContestFlowService {
  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    @InjectRepository(ContestEntity)
    private readonly contestRepository: Repository<ContestEntity>,
    @InjectRepository(ContestFlowMetadataEntity)
    private readonly flowMetadataRepository: Repository<ContestFlowMetadataEntity>,
    @InjectRepository(ContestSubmissionEntity)
    private readonly submissionRepository: Repository<ContestSubmissionEntity>,
    @InjectRepository(ContestWinnerCandidateEntity)
    private readonly candidateRepository: Repository<ContestWinnerCandidateEntity>,
    @InjectRepository(ContestReviewActionEntity)
    private readonly reviewActionRepository: Repository<ContestReviewActionEntity>,
    @InjectRepository(ContestRewardEntity)
    private readonly contestRewardRepository: Repository<ContestRewardEntity>,
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(MediaAISettingsEntity)
    private readonly mediaAISettingsRepository: Repository<MediaAISettingsEntity>,
    private readonly rewardService: RewardService,
    private readonly userActivityService: UserActivityService,
    private readonly notificationGateway: NotificationGateway,
    private readonly twitterApiIoService: TwitterApiIoService,
  ) {}

  async createMetadataForContest(
    contest: ContestEntity,
  ): Promise<ContestFlowMetadataEntity> {
    const now = new Date();
    const lifecycleStatus =
      contest.startTime <= now && contest.endTime >= now
        ? ContestLifecycleStatus.RUNNING
        : ContestLifecycleStatus.SCHEDULED;

    const metadata = this.flowMetadataRepository.create({
      contestId: contest.id,
      lifecycleStatus,
      reviewStatus: ContestReviewStatus.NONE,
      visibility: ContestVisibility.PUBLIC,
      reviewSnapshotAt: null,
    });

    const savedMetadata = await this.flowMetadataRepository.save(metadata);

    if (lifecycleStatus === ContestLifecycleStatus.RUNNING) {
      contest.status = ContestStatusEnum.OPEN;
      contest.isApproved = false;
      await this.contestRepository.save(contest);
    }

    return savedMetadata;
  }

  async isV2Contest(contestId?: number | null): Promise<boolean> {
    if (!contestId) {
      return false;
    }

    return (
      (await this.flowMetadataRepository.count({
        where: { contestId },
      })) > 0
    );
  }

  async startSubmission(
    params: StartSubmissionParams,
  ): Promise<ContestSubmissionEntity | null> {
    if (!params.contestId) {
      return null;
    }

    const metadata = await this.flowMetadataRepository.findOne({
      where: { contestId: params.contestId },
    });

    if (!metadata) {
      return null;
    }

    const contest = await this.contestRepository.findOne({
      where: { id: params.contestId },
      relations: { mediaAiSetting: true, tag: true },
    });

    if (!contest) {
      throw new NotFoundException('Contest not found');
    }

    const user = await this.userRepository.findOne({
      where: { id: params.userId },
      select: ['id', 'isDeleted'],
    });

    if (!user || user.isDeleted) {
      throw new BadRequestException('User is not allowed to join this contest');
    }

    this.assertContestAcceptsSubmission(contest, metadata);
    this.assertContestMediaAllowed(contest, params);

    const aiSetting = await this.mediaAISettingsRepository.findOne({
      where: {
        aiService: params.aiService,
        capability: params.capability,
        isActive: true,
      },
    });

    const submission = this.submissionRepository.create({
      contestId: contest.id,
      userId: params.userId,
      postId: null,
      generationJobId: null,
      submittedAt: new Date(),
      completedAt: null,
      mediaKind: params.mediaKind,
      aiSettingId: aiSetting?.id ?? null,
      status: ContestSubmissionStatus.ACCEPTED,
      eligibilityStatus: ContestSubmissionEligibilityStatus.ELIGIBLE,
    });

    return await this.submissionRepository.save(submission);
  }

  async attachQueueJob(
    submissionId: number | null | undefined,
    generationJobId: string | number | undefined,
  ) {
    if (
      !submissionId ||
      generationJobId === undefined ||
      generationJobId === null
    ) {
      return;
    }

    await this.submissionRepository.update(submissionId, {
      generationJobId: String(generationJobId),
      status: ContestSubmissionStatus.ENQUEUED,
    });
  }

  async markSubmissionFailed(submissionId: number | null | undefined) {
    if (!submissionId) {
      return;
    }

    await this.submissionRepository.update(submissionId, {
      status: ContestSubmissionStatus.FAILED,
      completedAt: new Date(),
    });
  }

  async completeGenerationPosts(
    submissionId: number | null | undefined,
    posts: PostEntity[],
  ): Promise<PostEntity[]> {
    if (!submissionId || posts.length === 0) {
      return posts;
    }

    const submission = await this.submissionRepository.findOne({
      where: { id: submissionId },
      relations: { contest: { participants: true, tag: true } },
    });

    if (!submission) {
      return posts;
    }

    const contest = submission.contest;
    const completedAt = new Date();
    const savedPosts: PostEntity[] = [];

    for (let index = 0; index < posts.length; index += 1) {
      const post = posts[index];
      post.isPublished = true;
      post.isSaved = true;
      post.contest = { id: contest.id } as ContestEntity;
      if (!post.tag && contest.tag) {
        post.tag = contest.tag;
      }
      savedPosts.push(await this.postRepository.save(post));

      if (index === 0) {
        submission.postId = post.id;
        submission.completedAt = completedAt;
        submission.status = ContestSubmissionStatus.PUBLISHED;
        submission.eligibilityStatus =
          ContestSubmissionEligibilityStatus.ELIGIBLE;
        await this.submissionRepository.save(submission);
      } else {
        const extraSubmission = this.submissionRepository.create({
          contestId: contest.id,
          userId: submission.userId,
          postId: post.id,
          generationJobId: submission.generationJobId,
          submittedAt: submission.submittedAt,
          completedAt,
          mediaKind: submission.mediaKind,
          aiSettingId: submission.aiSettingId,
          status: ContestSubmissionStatus.PUBLISHED,
          eligibilityStatus: ContestSubmissionEligibilityStatus.ELIGIBLE,
        });
        await this.submissionRepository.save(extraSubmission);
      }
    }

    await this.addContestParticipant(contest.id, submission.userId);

    return savedPosts;
  }

  async advanceContestLifecycle(
    contest: ContestEntity,
  ): Promise<LifecycleAdvanceResult> {
    const metadata = await this.flowMetadataRepository.findOne({
      where: { contestId: contest.id },
    });

    if (!metadata) {
      return { handled: false };
    }

    if (
      metadata.lifecycleStatus === ContestLifecycleStatus.COMPLETED ||
      metadata.lifecycleStatus === ContestLifecycleStatus.CANCELLED
    ) {
      return { handled: true };
    }

    const now = new Date();

    // Scheduled and not yet started: surface the explicit public status so the
    // app can render "starts soon" instead of a generic CLOSED.
    if (
      metadata.lifecycleStatus === ContestLifecycleStatus.SCHEDULED &&
      contest.startTime > now &&
      contest.status !== ContestStatusEnum.UPCOMING
    ) {
      contest.status = ContestStatusEnum.UPCOMING;
      await this.contestRepository.save(contest);
      return { handled: true };
    }

    if (
      contest.startTime <= now &&
      contest.endTime >= now &&
      metadata.lifecycleStatus !== ContestLifecycleStatus.RUNNING
    ) {
      metadata.lifecycleStatus = ContestLifecycleStatus.RUNNING;
      metadata.reviewStatus = ContestReviewStatus.NONE;
      contest.status = ContestStatusEnum.OPEN;
      contest.isApproved = false;
      await this.flowMetadataRepository.save(metadata);
      await this.contestRepository.save(contest);
      return { handled: true, opened: true };
    }

    if (contest.endTime < now) {
      if (metadata.lifecycleStatus !== ContestLifecycleStatus.REVIEWING) {
        metadata.lifecycleStatus = ContestLifecycleStatus.REVIEWING;
        metadata.reviewStatus = ContestReviewStatus.NONE;
        contest.status = ContestStatusEnum.PENDING_REVIEW;
        await this.flowMetadataRepository.save(metadata);
        await this.contestRepository.save(contest);
      }

      if (
        !metadata.reviewSnapshotAt &&
        (await this.canCreateReviewSnapshot(contest))
      ) {
        await this.createReviewSnapshot(contest.id);
      }
    }

    return { handled: true };
  }

  async createReviewSnapshot(contestId: number) {
    const contest = await this.contestRepository.findOne({
      where: { id: contestId },
      relations: { tag: true },
    });

    if (!contest) {
      throw new NotFoundException('Contest not found');
    }

    await this.candidateRepository.delete({ contestId });

    if (contest.contestType === ContestTypeEnum.FINE_TUNE) {
      await this.createFineTuneCandidates(contest);
    } else {
      await this.createStandardCandidates(contest);
    }

    await this.reviewActionRepository.save(
      this.reviewActionRepository.create({
        contestId,
        actionType: ContestReviewActionType.SNAPSHOT_CREATED,
        reason: null,
        metadata: { contestType: contest.contestType },
      }),
    );
  }

  async getReviewQueue() {
    const candidates = await this.candidateRepository.find({
      relations: {
        contest: { tag: true },
        post: { user: true },
        user: true,
        submission: true,
      },
      order: {
        contestId: 'ASC',
        rank: 'ASC',
      },
    });

    const contestIds = Array.from(new Set(candidates.map((c) => c.contestId)));
    const metadataRows = contestIds.length
      ? await this.flowMetadataRepository.find({
          where: { contestId: In(contestIds) },
        })
      : [];
    const metadataByContestId = new Map(
      metadataRows.map((metadata) => [metadata.contestId, metadata]),
    );

    const grouped = new Map<number, any>();
    for (const candidate of candidates) {
      if (!grouped.has(candidate.contestId)) {
        grouped.set(candidate.contestId, {
          contestId: candidate.contestId,
          contestName: candidate.contest?.name,
          contestType: candidate.contest?.contestType,
          contestStatus: candidate.contest?.status,
          lifecycleStatus:
            metadataByContestId.get(candidate.contestId)?.lifecycleStatus ??
            null,
          reviewStatus:
            metadataByContestId.get(candidate.contestId)?.reviewStatus ?? null,
          tag: candidate.contest?.tag
            ? {
                id: candidate.contest.tag.id,
                name: `#${candidate.contest.tag.name}`,
              }
            : null,
          candidates: [],
        });
      }

      grouped
        .get(candidate.contestId)
        .candidates.push(this.serializeCandidate(candidate));
    }

    return Array.from(grouped.values()).sort((a, b) => {
      if (a.reviewStatus === ContestReviewStatus.CANDIDATES_READY) return -1;
      if (b.reviewStatus === ContestReviewStatus.CANDIDATES_READY) return 1;
      return a.contestId - b.contestId;
    });
  }

  async approveCandidate(
    contestId: number,
    candidateId: number,
    adminUserId?: number | null,
  ) {
    const result = await this.dataSource.transaction(async (manager) => {
      const candidateRepo = manager.getRepository(ContestWinnerCandidateEntity);
      const contestRepo = manager.getRepository(ContestEntity);
      const metadataRepo = manager.getRepository(ContestFlowMetadataEntity);
      const userRepo = manager.getRepository(UserEntity);
      const rewardRepo = manager.getRepository(ContestRewardEntity);
      const actionRepo = manager.getRepository(ContestReviewActionEntity);

      const candidate = await candidateRepo.findOne({
        where: { id: candidateId, contestId },
        relations: { post: { user: true }, user: true, contest: true },
      });

      if (!candidate || !candidate.post || !candidate.user) {
        throw new NotFoundException('Candidate not found');
      }

      if (
        candidate.eligibilityStatus !==
        ContestSubmissionEligibilityStatus.ELIGIBLE
      ) {
        throw new BadRequestException(
          'Ineligible candidate cannot be approved',
        );
      }

      const existingReward = await rewardRepo.findOne({ where: { contestId } });
      if (existingReward?.status === ContestRewardStatus.PAID) {
        return { candidate, contest: candidate.contest, alreadyPaid: true };
      }

      const contest = await contestRepo.findOne({
        where: { id: contestId },
      });
      if (!contest) {
        throw new NotFoundException('Contest not found');
      }

      const user = await userRepo.findOne({ where: { id: candidate.userId } });
      if (!user) {
        throw new NotFoundException('Winner user not found');
      }

      await candidateRepo.update(
        {
          contestId,
          eligibilityStatus: ContestSubmissionEligibilityStatus.ELIGIBLE,
          reviewStatus: ContestWinnerCandidateReviewStatus.SELECTED,
        },
        { reviewStatus: ContestWinnerCandidateReviewStatus.CANDIDATE },
      );
      candidate.reviewStatus = ContestWinnerCandidateReviewStatus.APPROVED;
      await candidateRepo.save(candidate);

      contest.postWinner = { id: candidate.postId } as PostEntity;
      contest.winner = { id: user.id } as UserEntity;
      contest.status = ContestStatusEnum.CLOSED;
      contest.isApproved = true;
      await contestRepo.save(contest);

      user.points += Number(contest.reward ?? 0);
      await userRepo.save(user);

      const reward =
        existingReward ??
        rewardRepo.create({
          contestId,
          candidateId: candidate.id,
          userId: user.id,
          postId: candidate.postId,
          points: Number(contest.reward ?? 0),
        });
      reward.status = ContestRewardStatus.PAID;
      reward.paidAt = new Date();
      await rewardRepo.save(reward);

      await metadataRepo.update(
        { contestId },
        {
          lifecycleStatus: ContestLifecycleStatus.COMPLETED,
          reviewStatus: ContestReviewStatus.APPROVED,
        },
      );

      await actionRepo.save(
        actionRepo.create({
          contestId,
          candidateId,
          adminUserId: adminUserId ?? null,
          actionType: ContestReviewActionType.WINNER_APPROVED,
          reason: null,
          metadata: {
            rewardPoints: Number(contest.reward ?? 0),
            alreadyPaid: false,
          },
        }),
      );

      return { candidate, contest, alreadyPaid: false };
    });

    if (
      !result.alreadyPaid &&
      result.candidate.userId &&
      result.candidate.postId
    ) {
      await this.userActivityService.logContestWon({
        userId: result.candidate.userId,
        contestId: result.contest.id,
        contestName: result.contest.name,
        reward: Number(result.contest.reward ?? 0),
        postId: result.candidate.postId,
        previewUrl:
          result.candidate.post?.imageUrl ??
          result.candidate.post?.previewImageUrl ??
          result.contest.imageUrl ??
          null,
      });
      await this.notificationGateway.emitProfileUpdate(
        result.candidate.userId.toString(),
      );
    }

    return {
      success: true,
      message: result.alreadyPaid
        ? 'Winner was already approved.'
        : 'Winner approved successfully.',
    };
  }

  async rejectCandidate(
    contestId: number,
    candidateId: number,
    adminUserId?: number | null,
    reason?: string | null,
  ) {
    const candidate = await this.candidateRepository.findOne({
      where: { id: candidateId, contestId },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    candidate.reviewStatus = ContestWinnerCandidateReviewStatus.REJECTED;
    candidate.rejectionReason = reason ?? null;
    await this.candidateRepository.save(candidate);

    if (candidate.postId) {
      await this.postRepository.update(candidate.postId, { isRejected: true });
    }

    await this.reviewActionRepository.save(
      this.reviewActionRepository.create({
        contestId,
        candidateId,
        adminUserId: adminUserId ?? null,
        actionType: ContestReviewActionType.CANDIDATE_REJECTED,
        reason: reason ?? null,
        metadata: null,
      }),
    );

    const nextCandidate = await this.selectNextEligibleCandidate(contestId);
    if (!nextCandidate) {
      await this.markNoWinner(
        contestId,
        adminUserId,
        'No eligible candidates left.',
      );
    }

    return {
      success: true,
      message: nextCandidate
        ? 'Candidate rejected. Next candidate selected.'
        : 'Candidate rejected. No eligible candidates left.',
      nextCandidate: nextCandidate
        ? this.serializeCandidate(nextCandidate)
        : null,
    };
  }

  async selectCandidate(
    contestId: number,
    candidateId: number,
    adminUserId?: number | null,
  ) {
    const candidate = await this.candidateRepository.findOne({
      where: { id: candidateId, contestId },
      relations: { post: { user: true }, user: true },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    if (
      candidate.eligibilityStatus !==
      ContestSubmissionEligibilityStatus.ELIGIBLE
    ) {
      throw new BadRequestException('Ineligible candidate cannot be selected');
    }

    await this.candidateRepository.update(
      {
        contestId,
        eligibilityStatus: ContestSubmissionEligibilityStatus.ELIGIBLE,
        reviewStatus: ContestWinnerCandidateReviewStatus.SELECTED,
      },
      { reviewStatus: ContestWinnerCandidateReviewStatus.CANDIDATE },
    );
    candidate.reviewStatus = ContestWinnerCandidateReviewStatus.SELECTED;
    await this.candidateRepository.save(candidate);
    await this.projectSelectedCandidateToLegacyContest(contestId, candidate);

    await this.reviewActionRepository.save(
      this.reviewActionRepository.create({
        contestId,
        candidateId,
        adminUserId: adminUserId ?? null,
        actionType: ContestReviewActionType.CANDIDATE_SELECTED,
        reason: null,
        metadata: null,
      }),
    );

    return {
      success: true,
      message: 'Candidate selected for review.',
      candidate: this.serializeCandidate(candidate),
    };
  }

  async markNoWinner(
    contestId: number,
    adminUserId?: number | null,
    reason?: string | null,
  ) {
    await this.flowMetadataRepository.update(
      { contestId },
      {
        lifecycleStatus: ContestLifecycleStatus.COMPLETED,
        reviewStatus: ContestReviewStatus.NO_WINNER,
      },
    );

    await this.contestRepository.update(contestId, {
      status: ContestStatusEnum.CLOSED,
      isApproved: true,
      winner: null,
      postWinner: null,
    });

    await this.reviewActionRepository.save(
      this.reviewActionRepository.create({
        contestId,
        candidateId: null,
        adminUserId: adminUserId ?? null,
        actionType: ContestReviewActionType.NO_WINNER,
        reason: reason ?? null,
        metadata: null,
      }),
    );

    return {
      success: true,
      message: 'Contest marked as no winner.',
    };
  }

  async getContestSummary(contestId: number) {
    const [metadata, submissionsCount, selectedCandidate] = await Promise.all([
      this.flowMetadataRepository.findOne({ where: { contestId } }),
      this.submissionRepository.count({ where: { contestId } }),
      this.candidateRepository.findOne({
        where: {
          contestId,
          reviewStatus: In([
            ContestWinnerCandidateReviewStatus.SELECTED,
            ContestWinnerCandidateReviewStatus.APPROVED,
          ]),
        },
        relations: { post: { user: true }, user: true },
        order: { rank: 'ASC' },
      }),
    ]);

    if (!metadata) {
      return {
        flowVersion: 'legacy',
        lifecycleStatus: null,
        reviewStatus: null,
        submissionsCount: 0,
        currentCandidate: null,
      };
    }

    return {
      flowVersion: metadata.flowVersion,
      lifecycleStatus: metadata.lifecycleStatus,
      reviewStatus: metadata.reviewStatus,
      visibility: metadata.visibility,
      reviewSnapshotAt: metadata.reviewSnapshotAt,
      submissionsCount,
      currentCandidate: selectedCandidate
        ? this.serializeCandidate(selectedCandidate)
        : null,
    };
  }

  async setLifecycleStatus(
    contestId: number,
    lifecycleStatus: ContestLifecycleStatus,
    reviewStatus?: ContestReviewStatus,
  ) {
    const metadata = await this.flowMetadataRepository.findOne({
      where: { contestId },
    });
    if (!metadata) {
      return;
    }

    metadata.lifecycleStatus = lifecycleStatus;
    if (reviewStatus) {
      metadata.reviewStatus = reviewStatus;
    }
    await this.flowMetadataRepository.save(metadata);
  }

  private assertContestAcceptsSubmission(
    contest: ContestEntity,
    metadata: ContestFlowMetadataEntity,
  ) {
    if (metadata.visibility === ContestVisibility.HIDDEN) {
      throw new BadRequestException('Contest is hidden');
    }

    if (metadata.lifecycleStatus !== ContestLifecycleStatus.RUNNING) {
      throw new BadRequestException('Contest is not open for generation');
    }

    const now = new Date();
    if (now < contest.startTime) {
      throw new BadRequestException('Contest has not started yet');
    }

    if (now > contest.endTime) {
      throw new BadRequestException('Contest has already ended');
    }
  }

  private assertContestMediaAllowed(
    contest: ContestEntity,
    params: StartSubmissionParams,
  ) {
    if (contest.contestType === ContestTypeEnum.FINE_TUNE) {
      if (
        params.mediaKind !== 'image' ||
        params.capability !== 'image_generate' ||
        params.aiService !== 'sdxl_lora_generation'
      ) {
        throw new BadRequestException(
          'Fine-tune contests only accept SDXL LoRA image generations.',
        );
      }
      return;
    }

    if (params.aiService === 'sdxl_lora_generation') {
      throw new BadRequestException(
        'Fine-tune generation models can only be used in fine-tune contests.',
      );
    }
  }

  private async addContestParticipant(contestId: number, userId: number) {
    const contest = await this.contestRepository.findOne({
      where: { id: contestId },
      relations: { participants: true },
    });

    if (!contest) {
      return;
    }

    if (
      !contest.participants?.some((participant) => participant.id === userId)
    ) {
      contest.participants = [
        ...(contest.participants ?? []),
        { id: userId } as UserEntity,
      ];
      await this.contestRepository.save(contest);
    }

    await this.rewardService.markRewardEligible(
      userId,
      RewardTypeEnum.CONTEST_PARTICIPATION,
    );
  }

  private async canCreateReviewSnapshot(
    contest: ContestEntity,
  ): Promise<boolean> {
    const now = new Date();
    const settleMinutes = Number(
      this.configService.get<string>('CONTEST_REVIEW_SETTLE_MINUTES') ?? 30,
    );
    const pendingTimeoutMinutes = Number(
      this.configService.get<string>(
        'CONTEST_PENDING_SUBMISSION_TIMEOUT_MINUTES',
      ) ?? 120,
    );

    const settleAt = new Date(
      contest.endTime.getTime() + settleMinutes * 60 * 1000,
    );
    if (now < settleAt) {
      return false;
    }

    const pending = await this.submissionRepository.find({
      where: {
        contestId: contest.id,
        status: In([
          ContestSubmissionStatus.ACCEPTED,
          ContestSubmissionStatus.ENQUEUED,
          ContestSubmissionStatus.GENERATING,
        ]),
      },
      order: { submittedAt: 'DESC' },
      take: 1,
    });

    if (!pending.length) {
      return true;
    }

    const newestPendingDeadline = new Date(
      pending[0].submittedAt.getTime() + pendingTimeoutMinutes * 60 * 1000,
    );
    return now >= newestPendingDeadline;
  }

  private async createStandardCandidates(contest: ContestEntity) {
    const rows = await this.submissionRepository
      .createQueryBuilder('submission')
      .innerJoin('submission.post', 'post')
      .innerJoin('post.user', 'user')
      .leftJoin('post.likes', 'like')
      .where('submission.contestId = :contestId', { contestId: contest.id })
      .andWhere('submission.status = :status', {
        status: ContestSubmissionStatus.PUBLISHED,
      })
      .andWhere('post.isPublished = true')
      .andWhere('post.isBlocked = false')
      .andWhere('post.isRejected = false')
      .select('submission.id', 'submissionId')
      .addSelect('post.id', 'postId')
      .addSelect('user.id', 'userId')
      .addSelect('COUNT(like.id)', 'likeCount')
      .groupBy('submission.id')
      .addGroupBy('post.id')
      .addGroupBy('user.id')
      .orderBy('likeCount', 'DESC')
      .addOrderBy('submission.submittedAt', 'ASC')
      .addOrderBy('post.id', 'ASC')
      .getRawMany();

    const candidates = rows.map((row: any, index: number) =>
      this.candidateRepository.create({
        contestId: contest.id,
        submissionId: Number(row.submissionId),
        postId: Number(row.postId),
        userId: Number(row.userId),
        rank: index + 1,
        score: Number(row.likeCount ?? 0),
        scoreBreakdown: { likes: Number(row.likeCount ?? 0) },
        source: ContestWinnerCandidateSource.INTERNAL_LIKES,
        eligibilityStatus: ContestSubmissionEligibilityStatus.ELIGIBLE,
        reviewStatus:
          index === 0
            ? ContestWinnerCandidateReviewStatus.SELECTED
            : ContestWinnerCandidateReviewStatus.CANDIDATE,
      }),
    );

    await this.candidateRepository.save(candidates);
    await this.finalizeSnapshotState(contest, candidates[0] ?? null);
  }

  private async createFineTuneCandidates(contest: ContestEntity) {
    const submissions = await this.submissionRepository.find({
      where: {
        contestId: contest.id,
        status: ContestSubmissionStatus.PUBLISHED,
      },
      relations: { post: { user: true }, user: true },
      order: { submittedAt: 'ASC' },
    });

    const tweets = await this.fetchTweetsForContest(contest);
    const candidates: ContestWinnerCandidateEntity[] = [];

    for (const submission of submissions) {
      const post = submission.post;
      const user = post?.user ?? submission.user;
      const tweet = post
        ? this.findTweetForPost(tweets, contest, post.id)
        : null;
      let eligibilityStatus = ContestSubmissionEligibilityStatus.ELIGIBLE;
      let score = 0;
      let scoreBreakdown: Record<string, unknown> = {};

      if (!post || !post.isPublished) {
        eligibilityStatus =
          ContestSubmissionEligibilityStatus.INELIGIBLE_UNPUBLISHED;
      } else if (post.isBlocked) {
        eligibilityStatus =
          ContestSubmissionEligibilityStatus.INELIGIBLE_BLOCKED;
      } else if (post.isRejected) {
        eligibilityStatus =
          ContestSubmissionEligibilityStatus.INELIGIBLE_REJECTED;
      } else if (!post.tweetLink) {
        eligibilityStatus =
          ContestSubmissionEligibilityStatus.INELIGIBLE_NO_TWEET;
      } else if (!tweet) {
        eligibilityStatus =
          ContestSubmissionEligibilityStatus.INELIGIBLE_TWEET_NOT_MATCHED;
      } else if (!user?.twitterUsername) {
        eligibilityStatus =
          ContestSubmissionEligibilityStatus.INELIGIBLE_USER_NOT_MATCHED;
      } else {
        const retweetCheck = await this.checkRetweet(
          post.tweetLink,
          user.twitterUsername.replace(/^@/, ''),
        );
        if (!retweetCheck.retweet) {
          eligibilityStatus =
            ContestSubmissionEligibilityStatus.INELIGIBLE_NO_RETWEET;
        } else {
          scoreBreakdown = this.getTweetScoreBreakdown(tweet);
          score = Number(scoreBreakdown.score ?? 0);
        }
      }

      candidates.push(
        this.candidateRepository.create({
          contestId: contest.id,
          submissionId: submission.id,
          postId: post?.id ?? null,
          userId: user?.id ?? null,
          rank: 0,
          score,
          scoreBreakdown,
          source: ContestWinnerCandidateSource.TWITTER_ENGAGEMENT,
          eligibilityStatus,
          reviewStatus:
            eligibilityStatus === ContestSubmissionEligibilityStatus.ELIGIBLE
              ? ContestWinnerCandidateReviewStatus.CANDIDATE
              : ContestWinnerCandidateReviewStatus.INELIGIBLE,
        }),
      );
    }

    candidates.sort((a, b) => {
      const aEligible =
        a.eligibilityStatus === ContestSubmissionEligibilityStatus.ELIGIBLE;
      const bEligible =
        b.eligibilityStatus === ContestSubmissionEligibilityStatus.ELIGIBLE;
      if (aEligible !== bEligible) {
        return aEligible ? -1 : 1;
      }
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return (a.postId ?? 0) - (b.postId ?? 0);
    });

    let selected: ContestWinnerCandidateEntity | null = null;
    candidates.forEach((candidate, index) => {
      candidate.rank = index + 1;
      if (
        !selected &&
        candidate.eligibilityStatus ===
          ContestSubmissionEligibilityStatus.ELIGIBLE
      ) {
        candidate.reviewStatus = ContestWinnerCandidateReviewStatus.SELECTED;
        selected = candidate;
      }
    });

    await this.candidateRepository.save(candidates);
    await this.finalizeSnapshotState(contest, selected);
  }

  private async finalizeSnapshotState(
    contest: ContestEntity,
    selectedCandidate: ContestWinnerCandidateEntity | null,
  ) {
    const metadata = await this.flowMetadataRepository.findOne({
      where: { contestId: contest.id },
    });
    if (!metadata) {
      return;
    }

    metadata.reviewSnapshotAt = new Date();

    if (!selectedCandidate) {
      metadata.lifecycleStatus = ContestLifecycleStatus.COMPLETED;
      metadata.reviewStatus = ContestReviewStatus.NO_WINNER;
      contest.status = ContestStatusEnum.CLOSED;
      contest.isApproved = true;
      contest.winner = null;
      contest.postWinner = null;
    } else {
      metadata.lifecycleStatus = ContestLifecycleStatus.REVIEWING;
      metadata.reviewStatus = ContestReviewStatus.CANDIDATES_READY;
      contest.status = ContestStatusEnum.PENDING_REVIEW;
      contest.isApproved = false;
      contest.winner = { id: selectedCandidate.userId } as UserEntity;
      contest.postWinner = { id: selectedCandidate.postId } as PostEntity;
    }

    await this.flowMetadataRepository.save(metadata);
    await this.contestRepository.save(contest);
  }

  private async selectNextEligibleCandidate(contestId: number) {
    const nextCandidate = await this.candidateRepository.findOne({
      where: {
        contestId,
        eligibilityStatus: ContestSubmissionEligibilityStatus.ELIGIBLE,
        reviewStatus: ContestWinnerCandidateReviewStatus.CANDIDATE,
      },
      relations: { post: { user: true }, user: true },
      order: { rank: 'ASC' },
    });

    if (!nextCandidate) {
      return null;
    }

    nextCandidate.reviewStatus = ContestWinnerCandidateReviewStatus.SELECTED;
    await this.candidateRepository.save(nextCandidate);
    await this.projectSelectedCandidateToLegacyContest(
      contestId,
      nextCandidate,
    );
    return nextCandidate;
  }

  private async projectSelectedCandidateToLegacyContest(
    contestId: number,
    candidate: ContestWinnerCandidateEntity,
  ) {
    await this.contestRepository.update(contestId, {
      winner: candidate.userId
        ? ({ id: candidate.userId } as UserEntity)
        : null,
      postWinner: candidate.postId
        ? ({ id: candidate.postId } as PostEntity)
        : null,
      status: ContestStatusEnum.PENDING_REVIEW,
      isApproved: false,
    });
    await this.flowMetadataRepository.update(
      { contestId },
      {
        lifecycleStatus: ContestLifecycleStatus.REVIEWING,
        reviewStatus: ContestReviewStatus.CANDIDATES_READY,
      },
    );
  }

  private serializeCandidate(candidate: ContestWinnerCandidateEntity) {
    const post = candidate.post;
    const user = candidate.user ?? post?.user;

    return {
      id: candidate.id,
      rank: candidate.rank,
      score: candidate.score,
      scoreBreakdown: candidate.scoreBreakdown,
      source: candidate.source,
      eligibilityStatus: candidate.eligibilityStatus,
      reviewStatus: candidate.reviewStatus,
      rejectionReason: candidate.rejectionReason,
      submissionId: candidate.submissionId,
      post: post
        ? {
            id: post.id,
            imageUrl: post.imageUrl,
            videoUrl: post.videoUrl,
            previewImageUrl: post.previewImageUrl,
            tweetLink: post.tweetLink,
            user: user
              ? {
                  id: user.id,
                  name: user.name,
                  twitterUsername: user.twitterUsername,
                }
              : null,
          }
        : null,
      user: user
        ? {
            id: user.id,
            name: user.name,
            twitterUsername: user.twitterUsername,
          }
        : null,
    };
  }

  private async fetchTweetsForContest(contest: ContestEntity): Promise<any[]> {
    if (!contest.tag?.name) {
      return [];
    }

    try {
      const response = await this.twitterApiIoService.searchTweets(
        `from:y_allery #${contest.tag.name}`,
        'Latest',
        this.toUnixSeconds(contest.startTime),
        this.toUnixSeconds(contest.endTime),
      );

      return Array.isArray(response?.tweets) ? response.tweets : [];
    } catch {
      return [];
    }
  }

  private findTweetForPost(
    tweets: any[],
    contest: ContestEntity,
    postId: number,
  ) {
    const tagText = `#${contest.tag?.name ?? ''}`.toLowerCase();
    return tweets.find((tweet) => {
      const text = String(tweet.full_text ?? '').toLowerCase();
      return (
        text.includes(tagText) &&
        this.extractPostIdFromTweetText(text) === String(postId)
      );
    });
  }

  private getTweetScoreBreakdown(tweet: any) {
    const likes = Number(tweet.favorite_count ?? tweet.likeCount ?? 0);
    const retweets = Number(tweet.retweet_count ?? tweet.retweetCount ?? 0);
    const replies = Number(tweet.reply_count ?? tweet.replyCount ?? 0);
    const views = Number(tweet.view_count ?? tweet.viewCount ?? 0);
    return {
      likes,
      retweets,
      replies,
      views,
      score: likes + retweets * 2 + replies + views * 0.01,
    };
  }

  private extractPostIdFromTweetText(text: string): string | null {
    const match = text.match(/#(\d{1,10})\b/);
    return match ? match[1] : null;
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

  private extractTweetIdFromLink(tweetLink: string): string | null {
    const match = tweetLink?.match(/status\/(\d+)/);
    return match?.[1] || null;
  }

  private toUnixSeconds(date?: Date | string | null): number | undefined {
    if (!date) return undefined;
    const time = new Date(date).getTime();
    if (!Number.isFinite(time)) return undefined;
    return Math.floor(time / 1000);
  }
}
