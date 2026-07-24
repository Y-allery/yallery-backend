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
import { ContestStartNotificationQueueService } from './notifications/contest-start-notification-queue.service';

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

export type ContestFlowSummary = {
  flowVersion: string;
  lifecycleStatus: ContestLifecycleStatus | null;
  reviewStatus: ContestReviewStatus | null;
  visibility?: ContestVisibility;
  reviewSnapshotAt?: Date | null;
  submissionsCount: number;
  currentCandidate: Record<string, any> | null;
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
    private readonly contestStartNotificationQueueService: ContestStartNotificationQueueService,
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

      // A contest created already inside its window never crosses the
      // SCHEDULED→RUNNING edge the cron notifies on, so it would open
      // silently. The per-contest jobId makes this enqueue idempotent.
      await this.contestStartNotificationQueueService
        .enqueueContestStarted(contest)
        .catch((error) => {
          console.error(
            `Failed to enqueue start notifications for contest ${contest.id}:`,
            error?.message ?? error,
          );
        });
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

  async getFlowMetadataByContestIds(
    contestIds: number[],
  ): Promise<Map<number, ContestFlowMetadataEntity>> {
    if (!contestIds.length) {
      return new Map();
    }

    const rows = await this.flowMetadataRepository.find({
      where: { contestId: In(contestIds) },
    });
    return new Map(rows.map((metadata) => [metadata.contestId, metadata]));
  }

  async advanceContestLifecycle(
    contest: ContestEntity,
    // Pass null when the caller already knows no metadata exists (batch
    // lookups); undefined falls back to a per-contest query.
    preloadedMetadata?: ContestFlowMetadataEntity | null,
  ): Promise<LifecycleAdvanceResult> {
    const metadata =
      preloadedMetadata !== undefined
        ? preloadedMetadata
        : await this.flowMetadataRepository.findOne({
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

  async getReviewQueue(contestIds?: number[]) {
    let scopedContestIds: number[];
    let preloadedMetadata: ContestFlowMetadataEntity[] | null = null;

    if (contestIds) {
      scopedContestIds = Array.from(new Set(contestIds));
    } else {
      // Bare listing (admin review queue): scope to the lifecycle states the
      // review UI displays instead of loading every candidate ever created.
      preloadedMetadata = await this.flowMetadataRepository.find({
        where: {
          lifecycleStatus: In([
            ContestLifecycleStatus.RUNNING,
            ContestLifecycleStatus.REVIEWING,
            ContestLifecycleStatus.COMPLETED,
          ]),
        },
      });
      scopedContestIds = preloadedMetadata.map(
        (metadata) => metadata.contestId,
      );
    }

    if (!scopedContestIds.length) {
      return [];
    }

    const candidates = await this.candidateRepository.find({
      where: { contestId: In(scopedContestIds) },
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

    const candidateContestIds = Array.from(
      new Set(candidates.map((c) => c.contestId)),
    );
    const metadataRows =
      preloadedMetadata ??
      (candidateContestIds.length
        ? await this.flowMetadataRepository.find({
            where: { contestId: In(candidateContestIds) },
          })
        : []);
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

      // Atomic increment — a full-entity save() would overwrite points a
      // concurrent spend/credit changed since the findOne above.
      await userRepo.increment(
        { id: user.id },
        'points',
        Number(contest.reward ?? 0),
      );

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
    await this.dataSource.transaction(async (manager) => {
      const contestRepository = manager.getRepository(ContestEntity);
      const metadataRepository = manager.getRepository(
        ContestFlowMetadataEntity,
      );
      const reviewActionRepository = manager.getRepository(
        ContestReviewActionEntity,
      );

      // Serialize this exact contest transition. A concurrent retry waits for
      // the first request to commit and then observes its NO_WINNER action.
      const contest = await contestRepository.findOne({
        where: { id: contestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!contest) {
        throw new NotFoundException('Contest not found');
      }

      await metadataRepository.findOne({
        where: { contestId },
        lock: { mode: 'pessimistic_write' },
      });

      await metadataRepository.update(
        { contestId },
        {
          lifecycleStatus: ContestLifecycleStatus.COMPLETED,
          reviewStatus: ContestReviewStatus.NO_WINNER,
        },
      );

      await contestRepository.update(contestId, {
        status: ContestStatusEnum.CLOSED,
        isApproved: true,
        winner: null,
        postWinner: null,
      });

      const existingAction = await reviewActionRepository.findOne({
        where: {
          contestId,
          actionType: ContestReviewActionType.NO_WINNER,
        },
      });

      if (!existingAction) {
        await reviewActionRepository.save(
          reviewActionRepository.create({
            contestId,
            candidateId: null,
            adminUserId: adminUserId ?? null,
            actionType: ContestReviewActionType.NO_WINNER,
            reason: reason ?? null,
            metadata: null,
          }),
        );
      }
    });

    return {
      success: true,
      message: 'Contest marked as no winner.',
    };
  }

  async getContestSummary(contestId: number): Promise<ContestFlowSummary> {
    const summaries = await this.getContestSummaries([contestId]);
    return summaries.get(contestId) ?? this.buildLegacyContestSummary();
  }

  async getContestSummaries(
    contestIds: number[],
  ): Promise<Map<number, ContestFlowSummary>> {
    const summaries = new Map<number, ContestFlowSummary>();
    const uniqueContestIds = Array.from(new Set(contestIds));
    if (!uniqueContestIds.length) {
      return summaries;
    }

    const [metadataRows, submissionCountRows, selectedCandidates] =
      await Promise.all([
        this.flowMetadataRepository.find({
          where: { contestId: In(uniqueContestIds) },
        }),
        this.submissionRepository
          .createQueryBuilder('submission')
          .select('submission.contestId', 'contestId')
          .addSelect('COUNT(*)', 'count')
          .where('submission.contestId IN (:...contestIds)', {
            contestIds: uniqueContestIds,
          })
          .groupBy('submission.contestId')
          .getRawMany(),
        this.candidateRepository.find({
          where: {
            contestId: In(uniqueContestIds),
            reviewStatus: In([
              ContestWinnerCandidateReviewStatus.SELECTED,
              ContestWinnerCandidateReviewStatus.APPROVED,
            ]),
          },
          relations: { post: { user: true }, user: true },
          order: { contestId: 'ASC', rank: 'ASC' },
        }),
      ]);

    const metadataByContestId = new Map(
      metadataRows.map((metadata) => [metadata.contestId, metadata]),
    );
    const submissionsCountByContestId = new Map(
      submissionCountRows.map((row: any) => [
        Number(row.contestId),
        Number(row.count),
      ]),
    );
    // First candidate per contest = lowest rank, mirroring the single-contest
    // findOne ordered by rank ASC.
    const selectedCandidateByContestId = new Map<
      number,
      ContestWinnerCandidateEntity
    >();
    for (const candidate of selectedCandidates) {
      if (!selectedCandidateByContestId.has(candidate.contestId)) {
        selectedCandidateByContestId.set(candidate.contestId, candidate);
      }
    }

    for (const contestId of uniqueContestIds) {
      const metadata = metadataByContestId.get(contestId);
      if (!metadata) {
        summaries.set(contestId, this.buildLegacyContestSummary());
        continue;
      }

      const selectedCandidate = selectedCandidateByContestId.get(contestId);
      summaries.set(contestId, {
        flowVersion: metadata.flowVersion,
        lifecycleStatus: metadata.lifecycleStatus,
        reviewStatus: metadata.reviewStatus,
        visibility: metadata.visibility,
        reviewSnapshotAt: metadata.reviewSnapshotAt,
        submissionsCount: submissionsCountByContestId.get(contestId) ?? 0,
        currentCandidate: selectedCandidate
          ? this.serializeCandidate(selectedCandidate)
          : null,
      });
    }

    return summaries;
  }

  private buildLegacyContestSummary(): ContestFlowSummary {
    return {
      flowVersion: 'legacy',
      lifecycleStatus: null,
      reviewStatus: null,
      submissionsCount: 0,
      currentCandidate: null,
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
        params.aiService !== 'krea2_lora_generation'
      ) {
        throw new BadRequestException(
          'Fine-tune contests only accept Krea 2 LoRA image generations.',
        );
      }
      return;
    }

    if (params.aiService === 'krea2_lora_generation') {
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

  /**
   * Fine-tune winners are RANKED by in-app like counts (same signal as
   * standard contests) and finalized by an admin in the review queue, but the
   * retweet remains an ELIGIBILITY requirement: a submission without a
   * verified retweet cannot win regardless of its likes. Unlike
   * createStandardCandidates, ineligible submissions are still persisted as
   * INELIGIBLE rows so the review queue shows why each entry lost.
   */
  private async createFineTuneCandidates(contest: ContestEntity) {
    const submissions = await this.submissionRepository.find({
      where: {
        contestId: contest.id,
        status: ContestSubmissionStatus.PUBLISHED,
      },
      relations: { post: { user: true }, user: true },
      order: { submittedAt: 'ASC' },
    });

    type FineTuneEvaluation = {
      submission: ContestSubmissionEntity;
      post: PostEntity | null;
      user: UserEntity | null;
      eligibilityStatus: ContestSubmissionEligibilityStatus;
      needsRetweetCheck: boolean;
    };

    const evaluations: FineTuneEvaluation[] = submissions.map((submission) => {
      const post = submission.post;
      const user = post?.user ?? submission.user;
      let eligibilityStatus: ContestSubmissionEligibilityStatus =
        ContestSubmissionEligibilityStatus.ELIGIBLE;
      let needsRetweetCheck = false;

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
      } else if (!user?.twitterUsername) {
        eligibilityStatus =
          ContestSubmissionEligibilityStatus.INELIGIBLE_USER_NOT_MATCHED;
      } else {
        needsRetweetCheck = true;
      }

      return { submission, post, user, eligibilityStatus, needsRetweetCheck };
    });

    // The retweet is checked against the stored tweetLink directly; the old
    // tweet-engagement lookup (search y_allery's tweets and match the post)
    // existed only for Twitter-based scoring and stays removed.
    const pendingChecks = evaluations.filter(
      (evaluation) => evaluation.needsRetweetCheck,
    );
    const RETWEET_CHECK_CONCURRENCY = 3;
    let unavailableChecks = 0;
    for (
      let index = 0;
      index < pendingChecks.length;
      index += RETWEET_CHECK_CONCURRENCY
    ) {
      const chunk = pendingChecks.slice(
        index,
        index + RETWEET_CHECK_CONCURRENCY,
      );
      const results = await Promise.allSettled(
        chunk.map((evaluation) =>
          this.checkRetweet(
            evaluation.post!.tweetLink,
            evaluation.user!.twitterUsername.replace(/^@/, ''),
          ),
        ),
      );
      results.forEach((result, chunkIndex) => {
        const retweetCheck =
          result.status === 'fulfilled'
            ? result.value
            : { retweet: false, unavailable: true };
        if (retweetCheck.unavailable) {
          unavailableChecks += 1;
          return;
        }
        if (!retweetCheck.retweet) {
          chunk[chunkIndex].eligibilityStatus =
            ContestSubmissionEligibilityStatus.INELIGIBLE_NO_RETWEET;
        }
      });
    }

    // Winner selection pays out real points, so it must not run on partial
    // data. Aborting leaves reviewSnapshotAt null and the metadata in
    // REVIEWING, so the next cron sweep simply retries the snapshot once
    // Twitter is reachable again.
    if (unavailableChecks > 0) {
      throw new Error(
        `Retweet verification unavailable for ${unavailableChecks} of ` +
          `${pendingChecks.length} submissions in contest ${contest.id}; ` +
          'snapshot deferred to the next sweep',
      );
    }

    // One grouped query for all like counts at snapshot time.
    const eligiblePostIds = evaluations
      .filter(
        (evaluation) =>
          evaluation.eligibilityStatus ===
          ContestSubmissionEligibilityStatus.ELIGIBLE,
      )
      .map((evaluation) => evaluation.post!.id);

    const likeCountByPostId = new Map<number, number>();
    if (eligiblePostIds.length > 0) {
      const likeRows: Array<{ postId: number; likeCount: string }> =
        await this.candidateRepository.query(
          `SELECT postId, COUNT(*) AS likeCount
           FROM likes
           WHERE postId IN (${eligiblePostIds.map(() => '?').join(',')})
           GROUP BY postId`,
          eligiblePostIds,
        );
      for (const row of likeRows) {
        likeCountByPostId.set(Number(row.postId), Number(row.likeCount));
      }
    }

    const candidates = evaluations.map(
      ({ submission, post, user, eligibilityStatus }) => {
        let score = 0;
        let scoreBreakdown: Record<string, unknown> = {};
        if (eligibilityStatus === ContestSubmissionEligibilityStatus.ELIGIBLE) {
          score = likeCountByPostId.get(post!.id) ?? 0;
          scoreBreakdown = { likes: score };
        }

        return this.candidateRepository.create({
          contestId: contest.id,
          submissionId: submission.id,
          postId: post?.id ?? null,
          userId: user?.id ?? null,
          rank: 0,
          score,
          scoreBreakdown,
          source: ContestWinnerCandidateSource.INTERNAL_LIKES,
          eligibilityStatus,
          reviewStatus:
            eligibilityStatus === ContestSubmissionEligibilityStatus.ELIGIBLE
              ? ContestWinnerCandidateReviewStatus.CANDIDATE
              : ContestWinnerCandidateReviewStatus.INELIGIBLE,
        });
      },
    );

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

  /**
   * Verifies the user retweeted the stored y_allery tweet for their post.
   * `unavailable: true` means the check could not run (API outage) — callers
   * must not treat that as "did not retweet": failing closed here would let a
   * Twitter outage mark every submission ineligible and close the contest
   * with no winner and no payout.
   */
  private async checkRetweet(
    tweetLink: string,
    userHandle: string,
  ): Promise<{ retweet: boolean; unavailable?: boolean }> {
    const tweetId = this.extractTweetIdFromLink(tweetLink);
    if (!tweetId) {
      // Malformed link is a deterministic data problem, not an outage.
      return { retweet: false };
    }

    try {
      return await this.twitterApiIoService.verifyUserRetweeted(
        tweetId,
        userHandle,
      );
    } catch {
      return { retweet: false, unavailable: true };
    }
  }

  private extractTweetIdFromLink(tweetLink: string): string | null {
    const match = tweetLink?.match(/status\/(\d+)/);
    return match?.[1] || null;
  }
}
