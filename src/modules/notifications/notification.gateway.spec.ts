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
