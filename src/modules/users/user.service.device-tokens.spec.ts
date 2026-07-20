import { NotFoundException } from '@nestjs/common';
import { UserService } from 'src/modules/users/user.service';
import { DeviceType } from 'src/modules/users/types/device.interface';

/**
 * Device tokens identify one app install, not one user. Registration used to
 * upsert on (user, deviceType) with a read-then-write, which let the same token
 * stay attached to a previous owner — on prod one token was bound to 19
 * accounts, so that phone received all 19 accounts' pushes.
 */
describe('UserService device tokens', () => {
  const createService = ({ userExists = true, affected = 1 }: any = {}) => {
    const userModel = {
      findOne: jest.fn(async () => (userExists ? { id: 7 } : null)),
      exist: jest.fn(async () => userExists),
    };
    const deviceTokenModel = {
      query: jest.fn(async (_sql: string, _params: unknown[]) => ({})),
      delete: jest.fn(async (_criteria: unknown) => ({ affected })),
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
      {} as any, // 9
      {} as any, // 10
      {} as any, // 11
      {} as any, // 12
      {} as any, // 13
      {} as any, // 14
      {} as any, // 15
      {} as any, // 16
      {} as any, // 17
    );

    return { service, userModel, deviceTokenModel };
  };

  describe('addDeviceToken', () => {
    it('upserts on the token so re-registering moves the device to the current user', async () => {
      const { service, deviceTokenModel } = createService();

      await service.addDeviceToken(7, 'tok-abc', DeviceType.Android);

      expect(deviceTokenModel.query).toHaveBeenCalledTimes(1);
      const [sql, params] = deviceTokenModel.query.mock.calls[0];
      // Keyed on the token's unique index, not on (user, deviceType).
      expect(sql).toContain('ON DUPLICATE KEY UPDATE');
      expect(sql).toContain('userId = VALUES(userId)');
      expect(sql).toContain('updatedAt = NOW()');
      expect(params).toEqual(['tok-abc', DeviceType.Android, 7]);
    });

    it('is a single statement, so concurrent registrations cannot duplicate a row', async () => {
      const { service, deviceTokenModel } = createService();

      await Promise.all([
        service.addDeviceToken(7, 'tok-abc', DeviceType.iOS),
        service.addDeviceToken(7, 'tok-abc', DeviceType.iOS),
      ]);

      // No read-then-write: each call is one atomic upsert.
      expect(deviceTokenModel.query).toHaveBeenCalledTimes(2);
      expect(deviceTokenModel.delete).not.toHaveBeenCalled();
    });

    it('rejects an unknown user', async () => {
      const { service, deviceTokenModel } = createService({ userExists: false });

      await expect(
        service.addDeviceToken(7, 'tok-abc', DeviceType.iOS),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(deviceTokenModel.query).not.toHaveBeenCalled();
    });
  });

  describe('removeDeviceTokensByType', () => {
    it('deletes only the given token, leaving the user\'s other devices alive', async () => {
      const { service, deviceTokenModel } = createService();

      await service.removeDeviceTokensByType(7, DeviceType.Android, 'tok-abc');

      expect(deviceTokenModel.delete).toHaveBeenCalledWith({
        user: { id: 7 },
        token: 'tok-abc',
      });
    });

    it('falls back to clearing the device type when no token is sent', async () => {
      const { service, deviceTokenModel } = createService();

      await service.removeDeviceTokensByType(7, DeviceType.Android);

      expect(deviceTokenModel.delete).toHaveBeenCalledWith({
        user: { id: 7 },
        deviceType: DeviceType.Android,
      });
    });

    it('reports when nothing matched', async () => {
      const { service } = createService({ affected: 0 });

      await expect(
        service.removeDeviceTokensByType(7, DeviceType.iOS, 'gone'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
