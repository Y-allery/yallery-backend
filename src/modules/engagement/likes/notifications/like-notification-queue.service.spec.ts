import { UserNotificationTypeEnum } from 'src/modules/notifications/types/user-notification-type.enum';
import { LikeNotificationQueueService } from './like-notification-queue.service';
import { LIKE_NOTIFICATIONS_JOB_NAME } from './like-notification.queue';

/**
 * The like write path used to await two FCM sends and two full profile
 * rebuilds before responding. Those side effects now run here, off the request,
 * and this service is the boundary that must never propagate a failure back
 * into a committed like.
 */
describe('LikeNotificationQueueService', () => {
  const makeService = () => {
    const queue = { add: jest.fn(async () => ({ id: '1' })) };
    const userService = {
      sendPushNotificationIfEnabled: jest.fn(async () => undefined),
    };
    const notificationGateway = {
      emitProfileUpdate: jest.fn(async () => undefined),
    };
    const service = new LikeNotificationQueueService(
      queue as any,
      userService as any,
      notificationGateway as any,
    );
    const logError = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation(() => undefined);

    return { service, queue, userService, notificationGateway, logError };
  };

  const job = { postOwnerId: 30, likerId: 10, postId: 20 };

  it('enqueues a retryable job carrying only ids', async () => {
    const { service, queue } = makeService();

    await service.enqueueLikeNotification(job);

    expect(queue.add).toHaveBeenCalledWith(
      LIKE_NOTIFICATIONS_JOB_NAME,
      job,
      expect.objectContaining({ attempts: 3, removeOnComplete: true }),
    );
  });

  it('never rejects when Redis is down', async () => {
    const { service, queue, logError } = makeService();
    queue.add.mockRejectedValue(new Error('redis down'));

    await expect(service.enqueueLikeNotification(job)).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalled();
  });

  it('fans out both pushes and both profile emits', async () => {
    const { service, userService, notificationGateway } = makeService();

    await service.processLikeNotification(job);

    expect(userService.sendPushNotificationIfEnabled).toHaveBeenCalledWith(
      30,
      UserNotificationTypeEnum.LIKE_EARN,
    );
    expect(userService.sendPushNotificationIfEnabled).toHaveBeenCalledWith(
      10,
      UserNotificationTypeEnum.LIKE_SPEND,
    );
    expect(notificationGateway.emitProfileUpdate).toHaveBeenCalledWith('10');
    expect(notificationGateway.emitProfileUpdate).toHaveBeenCalledWith('30');
  });

  it('completes the job when one side effect fails, so the rest still run', async () => {
    const { service, userService, notificationGateway, logError } =
      makeService();
    userService.sendPushNotificationIfEnabled.mockRejectedValue(
      new Error('FCM down'),
    );

    await expect(service.processLikeNotification(job)).resolves.toBeUndefined();
    // A retry would re-send whatever did go out, so the job must not fail.
    expect(notificationGateway.emitProfileUpdate).toHaveBeenCalledTimes(2);
    expect(logError).toHaveBeenCalled();
  });
});
