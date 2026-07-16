import { In } from 'typeorm';
import { ContestFlowService } from './contest-flow.service';
import { ContestEntity } from './entity/contest.entity';
import { ContestFlowMetadataEntity } from './entity/contest-flow-metadata.entity';
import { ContestReviewActionEntity } from './entity/contest-review-action.entity';
import { ContestRewardEntity } from './entity/contest-reward.entity';
import { ContestWinnerCandidateEntity } from './entity/contest-winner-candidate.entity';
import {
  ContestLifecycleStatus,
  ContestReviewStatus,
  ContestRewardStatus,
  ContestSubmissionEligibilityStatus,
  ContestWinnerCandidateReviewStatus,
} from './types/contest-flow.enums';
import { ContestTypeEnum } from './types/contest.status.enum';

describe('ContestFlowService review status updates', () => {
  function createService(overrides: Partial<Record<string, any>> = {}) {
    const repositories = {
      contestRepository: {
        update: jest.fn(),
        findOne: jest.fn(),
        save: jest.fn(),
      },
      flowMetadataRepository: { update: jest.fn() },
      submissionRepository: {},
      candidateRepository: {
        findOne: jest.fn(),
        update: jest.fn(),
        save: jest.fn(async (value) => value),
      },
      reviewActionRepository: {
        create: jest.fn((value) => value),
        save: jest.fn(async (value) => value),
      },
      contestRewardRepository: {},
      postRepository: {},
      userRepository: {
        findOne: jest.fn(),
        save: jest.fn(async (value) => value),
      },
      mediaAISettingsRepository: {},
      ...overrides,
    };

    const twitterApiIoService = overrides.twitterApiIoService ?? {
      searchTweets: jest.fn(),
      verifyUserRetweeted: jest.fn(),
    };

    const service = new ContestFlowService(
      { get: jest.fn() } as any,
      overrides.dataSource ?? ({} as any),
      repositories.contestRepository as any,
      repositories.flowMetadataRepository as any,
      repositories.submissionRepository as any,
      repositories.candidateRepository as any,
      repositories.reviewActionRepository as any,
      repositories.contestRewardRepository as any,
      repositories.postRepository as any,
      repositories.userRepository as any,
      repositories.mediaAISettingsRepository as any,
      {} as any,
      { logContestWon: jest.fn() } as any,
      { emitProfileUpdate: jest.fn() } as any,
      twitterApiIoService as any,
    );

    return { service, repositories, twitterApiIoService };
  }

  it('selectCandidate resets only currently selected eligible candidates', async () => {
    const candidate = {
      id: 10,
      contestId: 7,
      postId: 99,
      userId: 5,
      eligibilityStatus: ContestSubmissionEligibilityStatus.ELIGIBLE,
      reviewStatus: ContestWinnerCandidateReviewStatus.CANDIDATE,
      post: { id: 99, user: { id: 5 } },
      user: { id: 5 },
    };
    const { service, repositories } = createService();
    repositories.candidateRepository.findOne.mockResolvedValue(candidate);

    await service.selectCandidate(7, 10, 125);

    expect(repositories.candidateRepository.update).toHaveBeenCalledWith(
      {
        contestId: 7,
        eligibilityStatus: ContestSubmissionEligibilityStatus.ELIGIBLE,
        reviewStatus: ContestWinnerCandidateReviewStatus.SELECTED,
      },
      { reviewStatus: ContestWinnerCandidateReviewStatus.CANDIDATE },
    );
    expect(candidate.reviewStatus).toBe(
      ContestWinnerCandidateReviewStatus.SELECTED,
    );
  });

  it('approveCandidate resets only currently selected eligible candidates', async () => {
    const candidate = {
      id: 12,
      contestId: 8,
      postId: 101,
      userId: 6,
      eligibilityStatus: ContestSubmissionEligibilityStatus.ELIGIBLE,
      reviewStatus: ContestWinnerCandidateReviewStatus.SELECTED,
      post: {
        id: 101,
        imageUrl: 'https://example.com/post.png',
        user: { id: 6 },
      },
      user: { id: 6 },
      contest: { id: 8, name: 'Contest', reward: 1, imageUrl: null },
    };
    const contestRepository = {
      findOne: jest.fn(async () => ({ id: 8, name: 'Contest', reward: 1 })),
      save: jest.fn(async (value) => value),
    };
    const candidateRepository = {
      findOne: jest.fn(async () => candidate),
      update: jest.fn(),
      save: jest.fn(async (value) => value),
    };
    const rewardRepository = {
      findOne: jest.fn(async () => null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const actionRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const metadataRepository = { update: jest.fn() };
    const userRepository = {
      findOne: jest.fn(async () => ({ id: 6, points: 0 })),
      save: jest.fn(async (value) => value),
      increment: jest.fn(),
    };
    const manager = {
      getRepository: jest.fn((entity) => {
        const map = new Map<any, any>([
          [ContestWinnerCandidateEntity, candidateRepository],
          [ContestEntity, contestRepository],
          [ContestFlowMetadataEntity, metadataRepository],
          [ContestRewardEntity, rewardRepository],
          [ContestReviewActionEntity, actionRepository],
        ]);

        return map.get(entity) ?? userRepository;
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (callback) => callback(manager)),
    };
    const { service } = createService({ dataSource });

    await service.approveCandidate(8, 12, 125);

    expect(candidateRepository.update).toHaveBeenCalledWith(
      {
        contestId: 8,
        eligibilityStatus: ContestSubmissionEligibilityStatus.ELIGIBLE,
        reviewStatus: ContestWinnerCandidateReviewStatus.SELECTED,
      },
      { reviewStatus: ContestWinnerCandidateReviewStatus.CANDIDATE },
    );
    expect(candidate.reviewStatus).toBe(
      ContestWinnerCandidateReviewStatus.APPROVED,
    );
    // Payout must be an atomic increment, never a full-entity save that
    // could overwrite concurrent points changes with stale values.
    expect(userRepository.increment).toHaveBeenCalledWith(
      { id: 6 },
      'points',
      1,
    );
    expect(userRepository.save).not.toHaveBeenCalled();
    expect(rewardRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        points: 1,
        status: ContestRewardStatus.PAID,
        userId: 6,
      }),
    );
  });

  it('approveCandidate does not pay again when the reward is already paid', async () => {
    const candidate = {
      id: 12,
      contestId: 8,
      postId: 101,
      userId: 6,
      eligibilityStatus: ContestSubmissionEligibilityStatus.ELIGIBLE,
      reviewStatus: ContestWinnerCandidateReviewStatus.SELECTED,
      post: { id: 101, user: { id: 6 } },
      user: { id: 6 },
      contest: { id: 8, name: 'Contest', reward: 1, imageUrl: null },
    };
    const candidateRepository = {
      findOne: jest.fn(async () => candidate),
      update: jest.fn(),
      save: jest.fn(async (value) => value),
    };
    const rewardRepository = {
      findOne: jest.fn(async () => ({
        id: 3,
        contestId: 8,
        status: ContestRewardStatus.PAID,
      })),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const userRepository = {
      findOne: jest.fn(async () => ({ id: 6, points: 0 })),
      save: jest.fn(async (value) => value),
      increment: jest.fn(),
    };
    const manager = {
      getRepository: jest.fn((entity) => {
        const map = new Map<any, any>([
          [ContestWinnerCandidateEntity, candidateRepository],
          [ContestRewardEntity, rewardRepository],
        ]);

        return map.get(entity) ?? userRepository;
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (callback) => callback(manager)),
    };
    const { service } = createService({ dataSource });

    const result = await service.approveCandidate(8, 12, 125);

    expect(result.message).toBe('Winner was already approved.');
    expect(userRepository.increment).not.toHaveBeenCalled();
    expect(userRepository.save).not.toHaveBeenCalled();
    expect(rewardRepository.save).not.toHaveBeenCalled();
  });

  describe('getContestSummaries', () => {
    it('answers every requested contest with three set-based queries', async () => {
      const metadata = {
        contestId: 1,
        flowVersion: 'v2',
        lifecycleStatus: ContestLifecycleStatus.REVIEWING,
        reviewStatus: ContestReviewStatus.CANDIDATES_READY,
        visibility: 'public',
        reviewSnapshotAt: null,
      };
      const candidate = {
        id: 4,
        contestId: 1,
        rank: 1,
        score: 10,
        scoreBreakdown: { likes: 10 },
        source: 'internal_likes',
        eligibilityStatus: ContestSubmissionEligibilityStatus.ELIGIBLE,
        reviewStatus: ContestWinnerCandidateReviewStatus.SELECTED,
        rejectionReason: null,
        submissionId: 9,
        post: { id: 99, user: { id: 5, name: 'A', twitterUsername: null } },
        user: { id: 5, name: 'A', twitterUsername: null },
      };
      const getRawMany = jest.fn(async () => [{ contestId: 1, count: '3' }]);
      const queryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany,
      };
      const flowMetadataRepository = { find: jest.fn(async () => [metadata]) };
      const candidateRepository = { find: jest.fn(async () => [candidate]) };
      const { service } = createService({
        flowMetadataRepository,
        submissionRepository: {
          createQueryBuilder: jest.fn(() => queryBuilder),
        },
        candidateRepository,
      });

      const summaries = await service.getContestSummaries([1, 2]);

      expect(summaries.get(1)).toMatchObject({
        flowVersion: 'v2',
        lifecycleStatus: ContestLifecycleStatus.REVIEWING,
        reviewStatus: ContestReviewStatus.CANDIDATES_READY,
        submissionsCount: 3,
      });
      expect(summaries.get(1).currentCandidate).toMatchObject({
        id: 4,
        rank: 1,
      });
      // Contest without metadata falls back to the legacy summary shape.
      expect(summaries.get(2)).toEqual({
        flowVersion: 'legacy',
        lifecycleStatus: null,
        reviewStatus: null,
        submissionsCount: 0,
        currentCandidate: null,
      });
      expect(flowMetadataRepository.find).toHaveBeenCalledTimes(1);
      expect(candidateRepository.find).toHaveBeenCalledTimes(1);
      expect(getRawMany).toHaveBeenCalledTimes(1);
    });

    it('getContestSummary keeps the single-contest shape', async () => {
      const { service } = createService({
        flowMetadataRepository: { find: jest.fn(async () => []) },
        submissionRepository: {
          createQueryBuilder: jest.fn(() => ({
            select: jest.fn().mockReturnThis(),
            addSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            groupBy: jest.fn().mockReturnThis(),
            getRawMany: jest.fn(async () => []),
          })),
        },
        candidateRepository: { find: jest.fn(async () => []) },
      });

      await expect(service.getContestSummary(15)).resolves.toEqual({
        flowVersion: 'legacy',
        lifecycleStatus: null,
        reviewStatus: null,
        submissionsCount: 0,
        currentCandidate: null,
      });
    });
  });

  describe('getReviewQueue scoping', () => {
    it('scopes candidates to explicitly requested contest ids', async () => {
      const candidateRepository = { find: jest.fn(async () => []) };
      const flowMetadataRepository = { find: jest.fn(async () => []) };
      const { service } = createService({
        candidateRepository,
        flowMetadataRepository,
      });

      const result = await service.getReviewQueue([7, 7]);

      expect(result).toEqual([]);
      expect(candidateRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { contestId: In([7]) } }),
      );
      // Explicit ids skip the lifecycle prefilter query.
      expect(flowMetadataRepository.find).not.toHaveBeenCalled();
    });

    it('bare listing only loads candidates for displayed lifecycle states', async () => {
      const flowMetadataRepository = {
        find: jest.fn(async () => [
          {
            contestId: 3,
            lifecycleStatus: ContestLifecycleStatus.REVIEWING,
            reviewStatus: ContestReviewStatus.CANDIDATES_READY,
          },
        ]),
      };
      const candidateRepository = { find: jest.fn(async () => []) };
      const { service } = createService({
        flowMetadataRepository,
        candidateRepository,
      });

      await service.getReviewQueue();

      expect(flowMetadataRepository.find).toHaveBeenCalledWith({
        where: {
          lifecycleStatus: In([
            ContestLifecycleStatus.RUNNING,
            ContestLifecycleStatus.REVIEWING,
            ContestLifecycleStatus.COMPLETED,
          ]),
        },
      });
      expect(candidateRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { contestId: In([3]) } }),
      );
    });

    it('bare listing returns [] without touching candidates when nothing is active', async () => {
      const flowMetadataRepository = { find: jest.fn(async () => []) };
      const candidateRepository = { find: jest.fn(async () => []) };
      const { service } = createService({
        flowMetadataRepository,
        candidateRepository,
      });

      await expect(service.getReviewQueue()).resolves.toEqual([]);
      expect(candidateRepository.find).not.toHaveBeenCalled();
    });
  });

  describe('createReviewSnapshot fine-tune retweet checks', () => {
    it('runs checks with a concurrency cap and treats a failed check as no retweet', async () => {
      const contest = {
        id: 5,
        contestType: ContestTypeEnum.FINE_TUNE,
        tag: { name: 'cats' },
        startTime: new Date('2026-01-01T00:00:00Z'),
        endTime: new Date('2026-01-02T00:00:00Z'),
        reward: 10,
      };
      const submissions = [1, 2, 3, 4].map((id) => ({
        id,
        contestId: 5,
        submittedAt: new Date('2026-01-01T01:00:00Z'),
        post: {
          id: 100 + id,
          isPublished: true,
          isBlocked: false,
          isRejected: false,
          tweetLink: `https://x.com/y/status/${1000 + id}`,
          user: { id: 200 + id, twitterUsername: `@user${id}` },
        },
        user: { id: 200 + id, twitterUsername: `@user${id}` },
      }));
      const tweets = submissions.map((submission) => ({
        full_text: `#cats #${submission.post.id}`,
        favorite_count: submission.post.id,
      }));

      let active = 0;
      let maxActive = 0;
      const verifyUserRetweeted = jest.fn(async (_tweetId, handle) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        if (handle === 'user2') {
          throw new Error('twitter down');
        }
        return { retweet: true };
      });

      let savedCandidates: any[] = [];
      const metadata = { contestId: 5, reviewSnapshotAt: null };
      const { service, repositories } = createService({
        contestRepository: {
          findOne: jest.fn(async () => contest),
          save: jest.fn(async (value) => value),
        },
        flowMetadataRepository: {
          findOne: jest.fn(async () => metadata),
          save: jest.fn(async (value) => value),
        },
        submissionRepository: { find: jest.fn(async () => submissions) },
        candidateRepository: {
          delete: jest.fn(),
          create: jest.fn((value) => value),
          save: jest.fn(async (value) => {
            savedCandidates = value;
            return value;
          }),
        },
        twitterApiIoService: {
          searchTweets: jest.fn(async () => ({ tweets })),
          verifyUserRetweeted,
        },
      });

      await service.createReviewSnapshot(5);

      expect(verifyUserRetweeted).toHaveBeenCalledTimes(4);
      expect(maxActive).toBeLessThanOrEqual(3);
      expect(maxActive).toBeGreaterThan(1);

      expect(savedCandidates).toHaveLength(4);
      const failed = savedCandidates.find((c) => c.userId === 202);
      expect(failed.eligibilityStatus).toBe(
        ContestSubmissionEligibilityStatus.INELIGIBLE_NO_RETWEET,
      );
      expect(failed.reviewStatus).toBe(
        ContestWinnerCandidateReviewStatus.INELIGIBLE,
      );
      expect(failed.rank).toBe(4);

      // Highest engagement among eligible candidates is selected at rank 1.
      const selected = savedCandidates.find((c) => c.rank === 1);
      expect(selected.postId).toBe(104);
      expect(selected.reviewStatus).toBe(
        ContestWinnerCandidateReviewStatus.SELECTED,
      );
      expect(selected.eligibilityStatus).toBe(
        ContestSubmissionEligibilityStatus.ELIGIBLE,
      );

      expect(metadata).toMatchObject({
        lifecycleStatus: ContestLifecycleStatus.REVIEWING,
        reviewStatus: ContestReviewStatus.CANDIDATES_READY,
      });
      expect(repositories.reviewActionRepository.save).toHaveBeenCalled();
    });
  });
});
