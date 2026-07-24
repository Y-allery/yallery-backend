import { NotificationGateway } from './notification.gateway';

/**
 * emitProfileUpdate is the hottest fan-out in the app (every like fires two).
 * Its payload costs five queries including two unbounded COUNTs, so it must
 * not be built for users who have no socket to receive it.
 */
describe('NotificationGateway.emitProfileUpdate connectivity gate', () => {
  const makeGateway = ({
    roomSizes = {},
  }: { roomSizes?: Record<string, number> } = {}) => {
    const getUserProfile = jest.fn(async () => ({ id: 42, points: 100 }));
    const userService = { findById: jest.fn(), getUserProfile };
    const gateway = new NotificationGateway(
      userService as any,
      { find: jest.fn(), update: jest.fn(), query: jest.fn() } as any,
      { getBoolean: jest.fn(async () => true) } as any,
    );

    const roomEmit = jest.fn();
    const rooms = new Map<string, { size: number }>(
      Object.entries(roomSizes).map(([room, size]) => [room, { size } as any]),
    );
    gateway.server = {
      to: jest.fn(() => ({ emit: roomEmit })),
      sockets: { adapter: { rooms } },
    } as any;

    return { gateway, getUserProfile, roomEmit };
  };

  it('skips the profile rebuild entirely when the user has no socket', async () => {
    const { gateway, getUserProfile, roomEmit } = makeGateway();

    await gateway.emitProfileUpdate('42');

    expect(getUserProfile).not.toHaveBeenCalled();
    expect(roomEmit).not.toHaveBeenCalled();
  });

  it('builds and emits the profile for a connected user', async () => {
    const { gateway, getUserProfile, roomEmit } = makeGateway({
      roomSizes: { '42': 1 },
    });

    await gateway.emitProfileUpdate('42');

    expect(getUserProfile).toHaveBeenCalledWith(42);
    expect(roomEmit).toHaveBeenCalledWith(
      'profileUpdate',
      expect.objectContaining({ id: 42 }),
    );
  });

  it('gates per user, so an offline recipient costs nothing', async () => {
    const { gateway, getUserProfile } = makeGateway({ roomSizes: { '10': 2 } });

    await gateway.emitProfileUpdate('10');
    await gateway.emitProfileUpdate('30');

    expect(getUserProfile).toHaveBeenCalledTimes(1);
    expect(getUserProfile).toHaveBeenCalledWith(10);
  });
});
