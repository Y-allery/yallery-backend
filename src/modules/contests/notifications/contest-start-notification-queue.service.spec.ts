import { ContestTypeEnum } from '../types/contest.status.enum';
import { ContestStartNotificationQueueService } from './contest-start-notification-queue.service';
import { CONTEST_START_NOTIFICATIONS_JOB_NAME } from './contest-start-notification.queue';

describe('ContestStartNotificationQueueService', () => {
  it('enqueues force-start notifications as a deterministic background job', async () => {
    const queue = { add: jest.fn(async () => ({ id: 'job' })) };
    const service = new ContestStartNotificationQueueService(
      queue as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await service.enqueueContestStarted({
      id: 77,
      name: 'Smoke Contest',
      contestType: ContestTypeEnum.DEFAULT,
      imageUrl: 'https://example.com/cover.png',
    } as any);

    expect(result).toEqual({
      jobId: `${CONTEST_START_NOTIFICATIONS_JOB_NAME}:77`,
    });
    expect(queue.add).toHaveBeenCalledWith(
      CONTEST_START_NOTIFICATIONS_JOB_NAME,
      expect.objectContaining({
        contestId: 77,
        contestName: 'Smoke Contest',
        contestType: ContestTypeEnum.DEFAULT,
        previewUrl: 'https://example.com/cover.png',
      }),
      expect.objectContaining({
        jobId: `${CONTEST_START_NOTIFICATIONS_JOB_NAME}:77`,
        attempts: 3,
        removeOnComplete: true,
        removeOnFail: false,
      }),
    );
  });
});
