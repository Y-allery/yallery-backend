import { NotificationService } from './notification.service';
import {
  USER_NOTIFICATION_PREFERENCE_TYPES,
  UserNotificationTypeEnum,
} from './types/user-notification-type.enum';

describe('NotificationService.getNotificationPreferences', () => {
  const createService = (stored: any[] = []) => {
    const repository = {
      find: jest.fn(async () => stored),
      findOne: jest.fn(async () => null),
      create: jest.fn((row: any) => row),
      save: jest.fn(async (row: any) => row),
    };
    return {
      service: new NotificationService(repository as any),
      repository,
    };
  };

  // The settings screen has to agree with the push gate: a user with no row
  // receives LIKE_EARN pushes, so reporting the toggle as off would look like
  // the backend ignoring their setting.
  it('reports the type default when the user has no row', async () => {
    const { service } = createService([]);

    const result = await service.getNotificationPreferences(7, [
      ...USER_NOTIFICATION_PREFERENCE_TYPES,
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        key: UserNotificationTypeEnum.LIKE_EARN,
        enabled: true,
      }),
      expect.objectContaining({
        key: UserNotificationTypeEnum.LIKE_SPEND,
        enabled: false,
      }),
    ]);
  });

  it('reports an explicit opt-out as off', async () => {
    const { service } = createService([
      { activityType: UserNotificationTypeEnum.LIKE_EARN, enabled: false },
    ]);

    const result = await service.getNotificationPreferences(7, [
      UserNotificationTypeEnum.LIKE_EARN,
    ]);

    expect(result[0].enabled).toBe(false);
  });

  it('reports an explicit opt-in as on', async () => {
    const { service } = createService([
      { activityType: UserNotificationTypeEnum.LIKE_SPEND, enabled: true },
    ]);

    const result = await service.getNotificationPreferences(7, [
      UserNotificationTypeEnum.LIKE_SPEND,
    ]);

    expect(result[0].enabled).toBe(true);
  });

  it('localises the description and falls back to English', async () => {
    const { service } = createService([]);

    const [uk] = await service.getNotificationPreferences(
      7,
      [UserNotificationTypeEnum.LIKE_EARN],
      'uk',
    );
    const [fallback] = await service.getNotificationPreferences(
      7,
      [UserNotificationTypeEnum.LIKE_EARN],
      null,
    );

    expect(uk.description).not.toEqual(fallback.description);
    expect(fallback.description).toBe('Points earned from likes');
  });
});
