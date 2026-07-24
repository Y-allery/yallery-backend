import { ContestFlowService } from './contest-flow.service';
import { ContestSubmissionStatus } from './types/contest-flow.enums';

/**
 * Contest generations must behave like every other generation: the post is a
 * draft until the user publishes it. Before this, the server force-published
 * contest posts at finalization, so users found themselves in the feed (and in
 * the contest) without ever pressing Publish.
 */
describe('ContestFlowService — contest generations are drafts', () => {
  const buildService = (submission: any, posts: any[]) => {
    const submissionRepository = {
      findOne: jest.fn(async () => submission),
      find: jest.fn(async () => [submission]),
      create: jest.fn((row: any) => ({ ...row })),
      save: jest.fn(async (row: any) => row),
    };
    const postRepository = { save: jest.fn(async (post: any) => post) };
    const service = Object.create(ContestFlowService.prototype);
    Object.assign(service, {
      submissionRepository,
      postRepository,
      addContestParticipant: jest.fn(async () => undefined),
    });
    return { service, submissionRepository, postRepository, posts };
  };

  it('leaves generated contest posts unpublished and out of the participant list', async () => {
    const submission = {
      id: 1,
      userId: 7,
      contest: { id: 42, participants: [], tag: { id: 3 } },
      status: ContestSubmissionStatus.GENERATING,
    };
    const posts = [{ id: 100 }, { id: 101 }];
    const { service, submissionRepository, postRepository } = buildService(
      submission,
      posts,
    );

    const saved = await service.completeGenerationPosts(1, posts as any);

    expect(saved).toHaveLength(2);
    for (const post of saved) {
      expect(post.isPublished).toBeUndefined();
      expect(post.isSaved).toBe(true);
      expect(post.contest).toEqual({ id: 42 });
    }
    expect(submission.status).toBe(ContestSubmissionStatus.GENERATED);
    expect(submissionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: ContestSubmissionStatus.GENERATED }),
    );
    expect(service.addContestParticipant).not.toHaveBeenCalled();
    expect(postRepository.save).toHaveBeenCalledTimes(2);
  });

  it('promotes the submission to PUBLISHED only on explicit publish', async () => {
    const submission = {
      id: 1,
      userId: 7,
      postId: 100,
      status: ContestSubmissionStatus.GENERATED,
      completedAt: null,
    };
    const { service, submissionRepository } = buildService(submission, []);

    await service.markSubmissionPublishedForPost(100, 7);

    expect(submissionRepository.find).toHaveBeenCalledWith({
      where: { postId: 100, userId: 7 },
    });
    expect(submission.status).toBe(ContestSubmissionStatus.PUBLISHED);
    expect(submission.completedAt).toBeInstanceOf(Date);
  });

  it('is idempotent for an already published submission', async () => {
    const submission = {
      id: 1,
      userId: 7,
      postId: 100,
      status: ContestSubmissionStatus.PUBLISHED,
      completedAt: new Date('2026-07-24T00:00:00Z'),
    };
    const { service, submissionRepository } = buildService(submission, []);

    await service.markSubmissionPublishedForPost(100, 7);

    expect(submissionRepository.save).not.toHaveBeenCalled();
    expect(submission.completedAt).toEqual(new Date('2026-07-24T00:00:00Z'));
  });
});
