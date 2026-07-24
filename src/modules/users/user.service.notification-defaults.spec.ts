import { UserService } from 'src/modules/users/user.service';
import { UserNotificationTypeEnum } from 'src/modules/notifications/types/user-notification-type.enum';

/**
 * `notification_preferences` rows are written only when a user touches the
 * toggle, so the gate's old `preference && preference.enabled` test meant
 * "someone liked your post" pushes were dark for nearly every account. A
 * missing row must now resolve to the type's default; an explicit row must
 * still win in both directions.
 */
describe('UserService.sendPushNotificationIfEnabled preference defaults', () => {
  const createService = ({
    notificationsEnabled = true,
    preferences = [] as {
      activityType: UserNotificationTypeEnum;
      enabled: boolean;
    }[],
  }: any = {}) => {
    const userModel = {
      findOne: jest.fn(async () => ({
        id: 7,
        notificationsEnabled,
        notificationPreferences: preferences,
      })),
    };
    const deviceTokenModel = {
      find: jest.fn(async () => [{ id: 1, token: 'tok-abc' }]),
      remove: jest.fn(async () => undefined),
    };
    const firebaseService = {
      sendNotification: jest.fn(async () => ({ success: true })),
    };

    const service = new UserService(
      userModel as any, // 1 userModel
      {} as any, // 2
      {} as any, // 3
      {} as any, // 4
      deviceTokenModel as any, // 5 deviceTokenModel
      {} as any, // 6
      {} as any, // 7
      {} as any, // 8
      firebaseService as any, // 9 firebaseService
      {} as any, // 10
      {} as any, // 11
      {} as any, // 12
      {} as any, // 13
      {} as any, // 14
      {} as any, // 15
      {} as any, // 16
      {} as any, // 17
      {} as any, // 18 providerRuntimeConfigService
    );

    return { service, firebaseService };
  };

  it('sends LIKE_EARN when the user has no preference row at all', async () => {
    const { service, firebaseService } = createService({ preferences: [] });

    await service.sendPushNotificationIfEnabled(
      7,
      UserNotificationTypeEnum.LIKE_EARN,
    );

    expect(firebaseService.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('does not send LIKE_SPEND without an opt-in row', async () => {
    const { service, firebaseService } = createService({ preferences: [] });

    await service.sendPushNotificationIfEnabled(
      7,
      UserNotificationTypeEnum.LIKE_SPEND,
    );

    expect(firebaseService.sendNotification).not.toHaveBeenCalled();
  });

  it('sends LIKE_SPEND once the user opted in', async () => {
    const { service, firebaseService } = createService({
      preferences: [
        {
          activityType: UserNotificationTypeEnum.LIKE_SPEND,
          enabled: true,
        },
      ],
    });

    await service.sendPushNotificationIfEnabled(
      7,
      UserNotificationTypeEnum.LIKE_SPEND,
    );

    expect(firebaseService.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('respects an explicit LIKE_EARN opt-out', async () => {
    const { service, firebaseService } = createService({
      preferences: [
        { activityType: UserNotificationTypeEnum.LIKE_EARN, enabled: false },
      ],
    });

    await service.sendPushNotificationIfEnabled(
      7,
      UserNotificationTypeEnum.LIKE_EARN,
    );

    expect(firebaseService.sendNotification).not.toHaveBeenCalled();
  });

  it('still honours the global notificationsEnabled kill switch', async () => {
    const { service, firebaseService } = createService({
      notificationsEnabled: false,
      preferences: [],
    });

    await service.sendPushNotificationIfEnabled(
      7,
      UserNotificationTypeEnum.LIKE_EARN,
    );

    expect(firebaseService.sendNotification).not.toHaveBeenCalled();
  });

  it('leaves ungated types (DAILY_REWARD) unaffected by the missing row', async () => {
    const { service, firebaseService } = createService({ preferences: [] });

    await service.sendPushNotificationIfEnabled(
      7,
      UserNotificationTypeEnum.DAILY_REWARD,
    );

    expect(firebaseService.sendNotification).toHaveBeenCalledTimes(1);
  });
});
