import { ContestTypeEnum } from '../types/contest.status.enum';
import { USER_ACTIVITY_TYPES } from 'src/modules/engagement/user-activity/types/user-activity.constants';
import { ContestStartNotificationQueueService } from './contest-start-notification-queue.service';
import { CONTEST_START_NOTIFICATIONS_JOB_NAME } from './contest-start-notification.queue';

describe('ContestStartNotificationQueueService', () => {
  it('enqueues force-start notifications as a deterministic background job', async () => {
    const queue = {
      add: jest.fn(async () => ({ id: 'job' })),
      getJob: jest.fn(async () => null),
    };
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

  // The tap payload has to survive down to the FCM call: the client routes on `type`,
  // and FCM rejects a message whose data values are not strings.
  it('forwards the tap payload to every device token', async () => {
    const sendNotification = jest.fn(async () => ({ success: true }));
    const service = new ContestStartNotificationQueueService(
      {} as any, // queue
      {} as any, // userRepository
      { remove: jest.fn() } as any, // deviceTokenRepository
      {} as any, // userActivityRepository
      {} as any, // userActivityService
      { sendNotification } as any, // firebaseService
      {} as any, // notificationGateway
      {} as any, // contentTranslationService
    );

    const payload = {
      type: USER_ACTIVITY_TYPES.CONTEST_OPENED,
      contestId: '77',
    };
    const result = await (service as any).sendPushNotifications(
      { id: 1, deviceTokens: [{ token: 'tok-a' }, { token: 'tok-b' }] },
      'title',
      'body',
      payload,
    );

    expect(result).toEqual({ hadTokens: true, delivered: true });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification).toHaveBeenNthCalledWith(
      1,
      'tok-a',
      'title',
      'body',
      payload,
    );
    expect(sendNotification).toHaveBeenNthCalledWith(
      2,
      'tok-b',
      'title',
      'body',
      payload,
    );
    // Contract with the client: a plain string, not a number.
    expect(typeof payload.contestId).toBe('string');
    expect(payload.type).toBe('contest_opened');
  });
});
