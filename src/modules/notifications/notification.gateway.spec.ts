import { In } from 'typeorm';
import { NotificationGateway } from './notification.gateway';

describe('NotificationGateway.handleJoinRoom', () => {
  const makeClient = (userId: any = 42) => ({
    data: { userId },
    join: jest.fn(),
    emit: jest.fn(),
    connected: true,
  });

  const makeGateway = (posts: any[], user: any = { id: 42, emailVerified: true }) => {
    const userService = { findById: jest.fn(async () => user) };
    const postRepository = {
      find: jest.fn(async () => posts),
      update: jest.fn(async () => ({})),
      query: jest.fn(async (_sql: string, _params: unknown[]) => ({})),
    };
    const gateway = new NotificationGateway(
      userService as any,
      postRepository as any,
    );
    const roomEmit = jest.fn();
    gateway.server = { to: jest.fn(() => ({ emit: roomEmit })) } as any;
    return { gateway, userService, postRepository, roomEmit };
  };

  it('fetches undelivered posts oldest-first with a batch cap and a narrowed contest select', async () => {
    const { gateway, postRepository } = makeGateway([]);
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
    // Nothing fetched -> nothing marked delivered.
    expect(postRepository.update).not.toHaveBeenCalled();
  });

  it('emits the undelivered payloads unchanged and marks only the fetched batch as delivered', async () => {
    const imagePost = {
      id: 1,
      imageUrl: 'img-1',
      videoUrl: null,
      previewImageUrl: null,
      generationParams: { prompt: 'p' },
      hasAudio: false,
      contest: null,
    };
    const videoPost = {
      id: 2,
      imageUrl: null,
      videoUrl: 'vid-2',
      previewImageUrl: 'prev-2',
      generationParams: null,
      hasAudio: false,
      contest: {
        id: 9,
        socialPostSettings: { postToTwitter: true, postToInstagram: false },
      },
    };
    const { gateway, postRepository } = makeGateway([imagePost, videoPost]);
    const client = makeClient();

    await gateway.handleJoinRoom(client as any);

    expect(client.emit).toHaveBeenCalledWith('undeliveredImages', {
      images: {
        data: [
          {
            id: 1,
            imageUrl: 'img-1',
            videoUrl: null,
            previewImageUrl: null,
            generation_params: { prompt: 'p' },
            publishTo: { postToTwitter: false, postToInstagram: false },
          },
        ],
      },
    });
    expect(client.emit).toHaveBeenCalledWith('undeliveredVideo', {
      video: {
        data: [
          {
            id: 2,
            videoUrl: 'vid-2',
            previewImageUrl: 'prev-2',
            generation_params: null,
            publishTo: { postToTwitter: true, postToInstagram: false },
          },
        ],
      },
    });
    expect(postRepository.update).toHaveBeenCalledWith(
      { id: In([1, 2]) },
      { isDelivered: true },
    );
  });

  it('replays undelivered posts grouped per generation task with a top-level taskId', async () => {
    const taskAImage = (id: number) => ({
      id,
      imageUrl: `img-${id}`,
      videoUrl: null,
      previewImageUrl: null,
      generationParams: { prompt: 'p', taskId: 'task-a' },
      hasAudio: false,
      contest: null,
    });
    const legacyImage = {
      id: 7,
      imageUrl: 'img-7',
      videoUrl: null,
      previewImageUrl: null,
      generationParams: { prompt: 'old' },
      hasAudio: false,
      contest: null,
    };
    const { gateway } = makeGateway([taskAImage(1), taskAImage(2), legacyImage]);
    const client = makeClient();

    await gateway.handleJoinRoom(client as any);

    const imageEmits = client.emit.mock.calls.filter(
      ([event]) => event === 'undeliveredImages',
    );
    expect(imageEmits).toHaveLength(2);

    const taskEmit = imageEmits.find(([, payload]) => payload.taskId);
    expect(taskEmit[1].taskId).toBe('task-a');
    expect(taskEmit[1].images.data.map((img: any) => img.id)).toEqual([1, 2]);

    // Posts created before taskId persistence keep the exact legacy shape.
    const legacyEmit = imageEmits.find(([, payload]) => !payload.taskId);
    expect(legacyEmit[1]).not.toHaveProperty('taskId');
    expect(legacyEmit[1].images.data.map((img: any) => img.id)).toEqual([7]);
  });

  it('persists the taskId into generationParams when the user is offline', async () => {
    const { gateway, postRepository } = makeGateway([]);
    (gateway as any).getUserRoomSize = () => 0;

    await gateway.sendImageArrayNotification(
      '42',
      { data: [{ id: 11 }, { id: 12 }] },
      undefined,
      undefined,
      'task-b',
    );

    expect(postRepository.query).toHaveBeenCalledTimes(1);
    const [sql, params] = postRepository.query.mock.calls[0];
    expect(sql).toContain("JSON_SET(COALESCE(generationParams, JSON_OBJECT()), '$.taskId', ?)");
    expect(sql).toContain('isDelivered = false');
    expect(params).toEqual(['task-b', 11, 12]);
    expect(postRepository.update).not.toHaveBeenCalled();
  });

  it('keeps the plain isDelivered update when no taskId is provided offline', async () => {
    const { gateway, postRepository } = makeGateway([]);
    (gateway as any).getUserRoomSize = () => 0;

    await gateway.sendImageArrayNotification('42', { data: [{ id: 13 }] });

    expect(postRepository.query).not.toHaveBeenCalled();
    expect(postRepository.update).toHaveBeenCalledWith(
      { id: In([13]) },
      { isDelivered: false },
    );
  });

  it('emits the email verification status to the user room', async () => {
    const { gateway, roomEmit } = makeGateway([], {
      id: 42,
      emailVerified: false,
    });

    await gateway.handleJoinRoom(makeClient() as any);

    expect(gateway.server.to).toHaveBeenCalledWith('42');
    expect(roomEmit).toHaveBeenCalledWith('emailVerified', { success: false });
  });

  it('bails out without joining or querying when the user lookup misses', async () => {
    const { gateway, postRepository } = makeGateway([], null);
    const client = makeClient();

    await gateway.handleJoinRoom(client as any);

    expect(client.join).not.toHaveBeenCalled();
    expect(postRepository.find).not.toHaveBeenCalled();
  });
});
