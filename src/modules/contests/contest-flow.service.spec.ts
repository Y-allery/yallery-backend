import { ContestFlowService } from './contest-flow.service';
import { ContestEntity } from './entity/contest.entity';
import { ContestFlowMetadataEntity } from './entity/contest-flow-metadata.entity';
import { ContestReviewActionEntity } from './entity/contest-review-action.entity';
import { ContestRewardEntity } from './entity/contest-reward.entity';
import { ContestWinnerCandidateEntity } from './entity/contest-winner-candidate.entity';
import {
  ContestSubmissionEligibilityStatus,
  ContestWinnerCandidateReviewStatus,
} from './types/contest-flow.enums';

describe('ContestFlowService review status updates', () => {
  function createService(overrides: Partial<Record<string, any>> = {}) {
    const repositories = {
      contestRepository: { update: jest.fn(), findOne: jest.fn(), save: jest.fn() },
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
      userRepository: { findOne: jest.fn(), save: jest.fn(async (value) => value) },
      mediaAISettingsRepository: {},
      ...overrides,
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
      { searchTweets: jest.fn(), verifyUserRetweeted: jest.fn() } as any,
    );

    return { service, repositories };
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
      post: { id: 101, imageUrl: 'https://example.com/post.png', user: { id: 6 } },
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
  });
});
