import { In } from 'typeorm';
import { NotificationGateway } from './notification.gateway';

/**
 * Delivery must never be assumed from socket presence. A backgrounded iOS app
 * stays in its room for the length of the heartbeat, so an emit can vanish
 * while the post is still flagged delivered — the loss the undelivered replay
 * exists to prevent. Results are therefore flagged undelivered first and
 * cleared only on confirmation, and confirmation is only ever requested from
 * clients that advertised support (`ack=1`), because asking changes the wire
 * format and older apps drop such events entirely.
 */
describe('NotificationGateway delivery', () => {
  const makeClient = (userId: any = 42, { ack = false } = {}) => ({
    data: { userId },
    join: jest.fn(),
    emit: jest.fn(),
    connected: true,
    handshake: { query: ack ? { ack: '1' } : {} },
    timeout: jest.fn(),
  });

  /** A socket as seen through fetchSockets(). */
  const makeRemoteSocket = ({ ack = false, acks = true } = {}) => {
    const emitWithAck = jest.fn(async () => {
      if (!acks) throw new Error('operation has timed out');
      return { received: true };
    });
    return {
      handshake: { query: ack ? { ack: '1' } : {} },
      emit: jest.fn(),
      timeout: jest.fn(() => ({ emitWithAck })),
      emitWithAck,
    };
  };

  const makeGateway = ({
    posts = [],
    user = { id: 42, emailVerified: true },
    sockets = [],
    ackEnabled = true,
  }: any = {}) => {
    const userService = { findById: jest.fn(async () => user) };
    const postRepository = {
      find: jest.fn(async () => posts),
      update: jest.fn(async () => ({})),
      query: jest.fn(async (_sql: string, _params: unknown[]) => ({})),
    };
    const providerRuntimeConfigService = {
      getBoolean: jest.fn(async () => ackEnabled),
    };
    const gateway = new NotificationGateway(
      userService as any,
      postRepository as any,
      providerRuntimeConfigService as any,
    );
    const roomEmit = jest.fn();
    gateway.server = {
      to: jest.fn(() => ({ emit: roomEmit })),
      in: jest.fn(() => ({ fetchSockets: jest.fn(async () => sockets) })),
    } as any;
    return { gateway, userService, postRepository, roomEmit };
  };

  describe('live send', () => {
    it('flags the posts undelivered before emitting, then clears on confirmation', async () => {
      const socket = makeRemoteSocket({ ack: true });
      const { gateway, postRepository } = makeGateway({ sockets: [socket] });

      await gateway.sendImageArrayNotification(
        '42',
        { data: [{ id: 11 }] },
        undefined,
        undefined,
        'task-b',
      );

      // Written first, so a lost emit is recoverable by the replay.
      const [sql, params] = postRepository.query.mock.calls[0];
      expect(sql).toContain('isDelivered = false');
      expect(params).toEqual(['task-b', 11]);
      // Confirmed -> cleared.
      expect(postRepository.update).toHaveBeenCalledWith(
        { id: In([11]) },
        { isDelivered: true },
      );
    });

    it('leaves the post undelivered when an ack-capable client does not confirm', async () => {
      const socket = makeRemoteSocket({ ack: true, acks: false });
      const { gateway, postRepository } = makeGateway({ sockets: [socket] });

      await gateway.sendImageArrayNotification('42', { data: [{ id: 11 }] });

      expect(socket.emitWithAck).toHaveBeenCalled();
      // This is the frozen-app case: no confirmation, so the replay keeps it.
      expect(postRepository.update).not.toHaveBeenCalledWith(
        { id: In([11]) },
        { isDelivered: true },
      );
    });

    it('never asks a legacy client for an ack, and treats its presence as delivery', async () => {
      const socket = makeRemoteSocket({ ack: false });
      const { gateway, postRepository } = makeGateway({ sockets: [socket] });

      await gateway.sendImageArrayNotification('42', { data: [{ id: 11 }] });

      // Asking would change the wire format and the old app would drop it.
      expect(socket.emitWithAck).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith(
        'imageGenerated',
        expect.objectContaining({ images: { data: [{ id: 11 }] } }),
      );
      expect(postRepository.update).toHaveBeenCalledWith(
        { id: In([11]) },
        { isDelivered: true },
      );
    });

    it('keeps the post undelivered when nobody is connected', async () => {
      const { gateway, postRepository } = makeGateway({ sockets: [] });

      await gateway.sendImageArrayNotification('42', { data: [{ id: 13 }] });

      expect(postRepository.update).toHaveBeenCalledWith(
        { id: In([13]) },
        { isDelivered: false },
      );
      expect(postRepository.update).not.toHaveBeenCalledWith(
        { id: In([13]) },
        { isDelivered: true },
      );
    });

    it('counts one confirmation across devices as delivered', async () => {
      const confirming = makeRemoteSocket({ ack: true });
      const silent = makeRemoteSocket({ ack: true, acks: false });
      const { gateway, postRepository } = makeGateway({
        sockets: [silent, confirming],
      });

      await gateway.sendImageArrayNotification('42', { data: [{ id: 11 }] });

      expect(postRepository.update).toHaveBeenCalledWith(
        { id: In([11]) },
        { isDelivered: true },
      );
    });

    it('falls back to plain emits for everyone when the kill-switch is off', async () => {
      const socket = makeRemoteSocket({ ack: true });
      const { gateway } = makeGateway({ sockets: [socket], ackEnabled: false });

      await gateway.sendImageArrayNotification('42', { data: [{ id: 11 }] });

      expect(socket.emitWithAck).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalled();
    });
  });

  describe('joinRoom replay', () => {
    const imagePost = (id: number, taskId?: string) => ({
      id,
      imageUrl: `img-${id}`,
      videoUrl: null,
      previewImageUrl: null,
      generationParams: taskId ? { prompt: 'p', taskId } : { prompt: 'p' },
      hasAudio: false,
      contest: null,
    });

    it('fetches the backlog oldest-first with a batch cap', async () => {
      const { gateway, postRepository } = makeGateway();
      const client = makeClient();

      await gateway.handleJoinRoom(client as any);

      expect(client.join).toHaveBeenCalledWith('42');
      expect(postRepository.find).toHaveBeenCalledWith({
        where: { user: { id: 42 }, isDelivered: false },
        relations: ['contest'],
        select: {
          contest: {
            id: true,
            socialPostSettings: { postToTwitter: true, postToInstagram: true },
          },
        },
        order: { id: 'ASC' },
        take: 50,
      });
      expect(postRepository.update).not.toHaveBeenCalled();
    });

    it('replays plainly to a legacy client and clears the batch', async () => {
      const { gateway, postRepository } = makeGateway({
        posts: [imagePost(1)],
      });
      const client = makeClient(42, { ack: false });

      await gateway.handleJoinRoom(client as any);

      expect(client.emit).toHaveBeenCalledWith(
        'undeliveredImages',
        expect.objectContaining({
          images: { data: [expect.objectContaining({ id: 1 })] },
        }),
      );
      expect(postRepository.update).toHaveBeenCalledWith(
        { id: In([1]) },
        { isDelivered: true },
      );
    });

    it('clears an ack-capable client\'s batch only after it confirms', async () => {
      const { gateway, postRepository } = makeGateway({
        posts: [imagePost(1, 'task-a')],
      });
      const client = makeClient(42, { ack: true });
      const emitWithAck = jest.fn(async () => ({ received: true }));
      client.timeout.mockReturnValue({ emitWithAck } as any);

      await gateway.handleJoinRoom(client as any);

      expect(emitWithAck).toHaveBeenCalledWith(
        'undeliveredImages',
        expect.objectContaining({ taskId: 'task-a' }),
      );
      expect(postRepository.update).toHaveBeenCalledWith(
        { id: In([1]) },
        { isDelivered: true },
      );
    });

    it('keeps the batch for the next join when the ack times out', async () => {
      const { gateway, postRepository } = makeGateway({
        posts: [imagePost(1, 'task-a')],
      });
      const client = makeClient(42, { ack: true });
      client.timeout.mockReturnValue({
        emitWithAck: jest.fn(async () => {
          throw new Error('operation has timed out');
        }),
      } as any);

      await gateway.handleJoinRoom(client as any);

      // Nothing confirmed -> nothing cleared -> replayed next time.
      expect(postRepository.update).not.toHaveBeenCalled();
    });

    it('still groups the replay per task and keeps the legacy shape', async () => {
      const { gateway } = makeGateway({
        posts: [imagePost(1, 'task-a'), imagePost(2, 'task-a'), imagePost(7)],
      });
      const client = makeClient(42, { ack: false });

      await gateway.handleJoinRoom(client as any);

      const imageEmits = client.emit.mock.calls.filter(
        ([event]) => event === 'undeliveredImages',
      );
      expect(imageEmits).toHaveLength(2);

      const taskEmit = imageEmits.find(([, payload]) => payload.taskId);
      expect(taskEmit[1].taskId).toBe('task-a');
      expect(taskEmit[1].images.data.map((img: any) => img.id)).toEqual([1, 2]);

      const legacyEmit = imageEmits.find(([, payload]) => !payload.taskId);
      expect(legacyEmit[1]).not.toHaveProperty('taskId');
    });

    it('emits the email verification status to the user room', async () => {
      const { gateway, roomEmit } = makeGateway({
        user: { id: 42, emailVerified: false },
      });

      await gateway.handleJoinRoom(makeClient() as any);

      expect(gateway.server.to).toHaveBeenCalledWith('42');
      expect(roomEmit).toHaveBeenCalledWith('emailVerified', { success: false });
    });

    it('bails out without joining or querying when the user lookup misses', async () => {
      const { gateway, postRepository } = makeGateway({ user: null });
      const client = makeClient();

      await gateway.handleJoinRoom(client as any);

      expect(client.join).not.toHaveBeenCalled();
      expect(postRepository.find).not.toHaveBeenCalled();
    });
  });
});
