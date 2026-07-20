import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Inject, UseGuards, forwardRef } from '@nestjs/common';
import { WsAuthGuard } from 'src/modules/auth/guards/ws.auth.guard';
import { UserService } from 'src/modules/users/user.service';
import { In, Repository } from 'typeorm';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';

export type MediaGenerationErrorType =
  | 'image'
  | 'image_edit'
  | 'video'
  | 'audio'
  | 'meme';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/',
  transports: ['websocket'],
})
@UseGuards(WsAuthGuard)
export class NotificationGateway {
  /** Max undelivered posts flushed per joinRoom; the rest go out on subsequent joins. */
  private static readonly UNDELIVERED_POSTS_BATCH_SIZE = 50;

  /**
   * How long a client has to confirm. Generous on purpose: the point is to
   * catch a frozen app, and a slow-but-alive phone should not be mistaken for
   * one — an unconfirmed result is replayed later, so erring long is cheap.
   */
  private static readonly ACK_TIMEOUT_MS = 5000;

  /**
   * Clients advertise ack support with `ack=1` in the handshake query.
   * Requesting an ack changes the wire format — socket.io delivers
   * [payload, ackFn] instead of payload — and versions that do not expect it
   * drop the event entirely. So the ask is per connection, never global: an
   * un-updated app keeps receiving exactly what it receives today, and there
   * is no flag-flip moment that could blind everyone who has not upgraded.
   */
  private static readonly ACK_QUERY_FLAG = 'ack';

  constructor(
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    private readonly providerRuntimeConfigService: ProviderRuntimeConfigService,
  ) {}

  @WebSocketServer()
  server: Server;

  /**
   * Sends one event to a user's sockets and reports whether the result can be
   * considered delivered.
   *
   * `confirmed` is true when an ack-capable client acknowledged, or when a
   * legacy client was online — the latter cannot confirm, so treating its
   * presence as delivery keeps behaviour for un-updated apps exactly as it is
   * today rather than flooding them with replays.
   */
  private async deliverToUser(
    userId: string,
    event: string,
    payload: unknown,
  ): Promise<{ online: boolean; confirmed: boolean }> {
    const room = this.getUserRoomId(userId);

    let sockets: Awaited<ReturnType<Server['fetchSockets']>>;
    try {
      sockets = await this.server.in(room).fetchSockets();
    } catch (error) {
      // Never let a transport hiccup masquerade as "delivered".
      console.error(`[NotificationGateway] fetchSockets failed for ${room}:`, error);
      return { online: false, confirmed: false };
    }

    if (!sockets.length) {
      return { online: false, confirmed: false };
    }

    const ackEnabled = await this.providerRuntimeConfigService
      .getBoolean('WS_ACK_DELIVERY_ENABLED', true)
      .catch(() => true);

    const ackCapable = ackEnabled
      ? sockets.filter(
          (socket) =>
            socket.handshake.query[NotificationGateway.ACK_QUERY_FLAG] === '1',
        )
      : [];
    const legacy = sockets.filter((socket) => !ackCapable.includes(socket));

    for (const socket of legacy) {
      socket.emit(event, payload);
    }

    let acknowledged = false;
    if (ackCapable.length) {
      const results = await Promise.allSettled(
        ackCapable.map((socket) =>
          socket
            .timeout(NotificationGateway.ACK_TIMEOUT_MS)
            .emitWithAck(event, payload),
        ),
      );
      // One confirmation is enough: the user has seen it on some device, and
      // any other device still finds it in the gallery.
      acknowledged = results.some((result) => result.status === 'fulfilled');
    }

    return { online: true, confirmed: acknowledged || legacy.length > 0 };
  }

  /** Clears the undelivered flag once delivery is actually confirmed. */
  private async markDelivered(postIds: number[]): Promise<void> {
    if (!postIds.length) {
      return;
    }
    await this.postRepository.update(
      { id: In(postIds) },
      { isDelivered: true },
    );
  }

  /**
   * Replays one backlog batch to the joining socket and returns the post ids
   * that may now be considered delivered.
   *
   * The backlog was previously cleared in bulk right after a fire-and-forget
   * emit, so anything the client failed to take was lost for good — the exact
   * failure the flag exists to prevent. A batch that is not acknowledged stays
   * flagged and comes back on the next join.
   */
  private async replayToClient(
    client: Socket,
    event: string,
    payload: unknown,
    postIds: number[],
  ): Promise<number[]> {
    const supportsAck =
      client.handshake.query[NotificationGateway.ACK_QUERY_FLAG] === '1' &&
      (await this.providerRuntimeConfigService
        .getBoolean('WS_ACK_DELIVERY_ENABLED', true)
        .catch(() => true));

    if (!supportsAck) {
      // Legacy client: it cannot confirm, and asking would change the wire
      // format it expects. Emit plainly and keep today's behaviour.
      client.emit(event, payload);
      return postIds;
    }

    try {
      await client
        .timeout(NotificationGateway.ACK_TIMEOUT_MS)
        .emitWithAck(event, payload);
      return postIds;
    } catch {
      // Timed out: leave the batch flagged so the next join retries it.
      return [];
    }
  }

  /**
   * Delivers a generation result, flagging the posts undelivered FIRST and
   * clearing that flag only once delivery is confirmed.
   *
   * The old order — decide by room size, then emit, and touch the database
   * only when the user looked offline — lost results whenever the socket was
   * stale: a backgrounded iOS app stays in the room for the length of the
   * heartbeat, so the emit went nowhere while the post stayed marked
   * delivered and the joinRoom replay could never pick it up. Writing the
   * flag up front makes the replay the safety net it was meant to be; the
   * cost is that an unconfirmed delivery may be replayed once, which is why
   * clients must deduplicate by post id.
   */
  private async deliverPosts(
    userId: string,
    event: string,
    payload: unknown,
    postIds: number[],
    taskId?: string,
  ): Promise<void> {
    if (!postIds.length) {
      console.error(
        `[NotificationGateway] No valid post IDs for user ${userId}, event ${event}`,
      );
      return;
    }

    await this.markUndelivered(postIds, taskId);

    const { confirmed } = await this.deliverToUser(userId, event, payload);
    if (confirmed) {
      await this.markDelivered(postIds);
    }
  }

  /**
   * Offline path: flags the posts for the joinRoom backlog and persists the
   * generation taskId into generationParams — the live events carry taskId in
   * their payload, and without persisting it here the undelivered replay
   * would have no way to include it.
   */
  private async markUndelivered(
    postIds: number[],
    taskId?: string,
  ): Promise<void> {
    if (!postIds.length) {
      return;
    }
    if (taskId) {
      await this.postRepository.query(
        `UPDATE posts
         SET isDelivered = false,
             generationParams = JSON_SET(COALESCE(generationParams, JSON_OBJECT()), '$.taskId', ?)
         WHERE id IN (${postIds.map(() => '?').join(',')})`,
        [taskId, ...postIds],
      );
      return;
    }
    await this.postRepository.update(
      { id: In(postIds) },
      { isDelivered: false },
    );
  }

  /**
   * The joinRoom backlog can hold posts from several generation tasks, while
   * live events carry exactly one taskId per emission — so the replay groups
   * posts by their persisted taskId and emits one event per task, matching
   * the live payload shape. Pre-existing posts without a taskId form a single
   * legacy group whose payload has no taskId field, exactly as before.
   */
  private groupByTaskId<T extends { generationParams?: any }>(
    items: T[],
  ): Map<string | null, T[]> {
    const groups = new Map<string | null, T[]>();
    for (const item of items) {
      const taskId =
        typeof item.generationParams?.taskId === 'string'
          ? item.generationParams.taskId
          : null;
      const group = groups.get(taskId);
      if (group) {
        group.push(item);
      } else {
        groups.set(taskId, [item]);
      }
    }
    return groups;
  }

  async sendImageArrayNotification(
    to_user_id: string,
    images: any,
    activity_type?: string,
    isEdit?: boolean,
    taskId?: string,
  ) {
    const data = Array.isArray(images) ? images : images?.data;
    if (!Array.isArray(data) || data.length === 0) {
      console.error(
        `[NotificationGateway] Invalid images payload for user ${to_user_id}:`,
        images,
      );
      return;
    }

    const payload: Record<string, unknown> = { images: { data } };
    if (activity_type) {
      payload.activity_type = activity_type;
    }
    if (typeof isEdit === 'boolean') {
      payload.isEdit = isEdit;
    }
    if (taskId) {
      payload.taskId = taskId;
    }

    await this.deliverPosts(
      to_user_id,
      'imageGenerated',
      payload,
      data.map((image: any) => image?.id).filter((id: any) => id != null),
      taskId,
    );
  }

  async sendImageEditNotification(
    to_user_id: string,
    images: any,
    taskId?: string,
  ) {
    if (!Array.isArray(images?.data) || images.data.length === 0) {
      console.error(
        `[NotificationGateway] Invalid image edit payload for user ${to_user_id}:`,
        images,
      );
      return;
    }

    const payload: Record<string, unknown> = { images: { data: images.data } };
    if (taskId) {
      payload.taskId = taskId;
    }

    await this.deliverPosts(
      to_user_id,
      'imageEdited',
      payload,
      images.data.map((img: any) => img?.id).filter((id: any) => id != null),
      taskId,
    );
  }

  async sendVideoNotification(
    to_user_id: string,
    video: {
      uploadedVideoUrl: string;
      id: number;
      videoUrl?: string;
      previewImageUrl?: string;
      generationParams?: any;
      generation_params?: any;
      publishTo?: { postToTwitter: boolean; postToInstagram: boolean };
    },
    activity_type?: string,
    taskId?: string,
  ) {
    const payload: Record<string, unknown> = {
      video: {
        data: [
          {
            id: video.id,
            videoUrl: video.videoUrl || video.uploadedVideoUrl,
            previewImageUrl: video.previewImageUrl || null,
            generationParams:
              video.generationParams ?? video.generation_params ?? null,
            publishTo: video.publishTo ?? {
              postToTwitter: false,
              postToInstagram: false,
            },
          },
        ],
      },
    };
    if (activity_type) {
      payload.activity_type = activity_type;
    }
    if (taskId) {
      payload.taskId = taskId;
    }

    await this.deliverPosts(
      to_user_id,
      'videoGenerated',
      payload,
      [video.id],
      taskId,
    );
  }

  async sendAudioNotification(
    to_user_id: string,
    video: {
      uploadedVideoUrl: string;
      id: number;
      videoUrl?: string;
      previewImageUrl?: string;
      generationParams?: any;
      generation_params?: any;
      publishTo?: { postToTwitter: boolean; postToInstagram: boolean };
    },
    activity_type?: string,
    taskId?: string,
  ) {
    const payload: Record<string, unknown> = {
      audio: {
        data: [
          {
            id: video.id,
            videoUrl: video.videoUrl || video.uploadedVideoUrl,
            previewImageUrl: video.previewImageUrl || null,
            generationParams:
              video.generationParams ?? video.generation_params ?? null,
            publishTo: video.publishTo ?? {
              postToTwitter: false,
              postToInstagram: false,
            },
          },
        ],
      },
    };
    if (activity_type) {
      payload.activity_type = activity_type;
    }
    if (taskId) {
      payload.taskId = taskId;
    }

    await this.deliverPosts(
      to_user_id,
      'audioGenerated',
      payload,
      [video.id],
      taskId,
    );
  }

  async sendMediaGenerationError(
    toUserId: string,
    payload: {
      type: MediaGenerationErrorType;
      message: string;
      jobId?: string;
      taskId?: string;
      aiService?: string;
    },
  ) {
    this.server.to(toUserId).emit('mediaGenerationError', payload);
  }

  /** Meme generation: progress (e.g. "started", "processing") */
  async sendMemeGenerationProgress(
    toUserId: string,
    payload: { jobId: string; status: string; message?: string },
  ) {
    this.server.to(toUserId).emit('memeGenerationProgress', payload);
  }

  /** Meme generation: completed with video result. Same shape as imageGenerated but with memes instead of images; no activity_type, isEdit. */
  async sendMemeGenerated(
    toUserId: string,
    payload: {
      id: number;
      videoUrl: string;
      previewImageUrl?: string | null;
      generationParams: Record<string, unknown>;
      publishTo?: { postToTwitter: boolean; postToInstagram: boolean };
    },
    taskId?: string,
  ) {
    const event: Record<string, unknown> = { memes: { data: [payload] } };
    if (taskId) {
      event.taskId = taskId;
    }

    await this.deliverPosts(
      toUserId,
      'memeGenerated',
      event,
      [payload.id],
      taskId,
    );
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;
    const roomId = this.getUserRoomId(userId);
    // Not findAuthUserById: emailVerified is read at the end of this handler.
    const user = await this.userService.findById(userId);

    if (!user) {
      // User ID not found in socket data
      return;
    }

    client.join(roomId);

    // Oldest batch first; whatever is left gets flushed on the next join.
    // Only socialPostSettings is read off the contest, so skip its heavy
    // columns (JSON columns are fetched whole; the nested keys only satisfy
    // the FindOptionsSelect type).
    const undeliveredPosts = await this.postRepository.find({
      where: { user: { id: userId }, isDelivered: false },
      relations: ['contest'],
      select: {
        contest: {
          id: true,
          socialPostSettings: { postToTwitter: true, postToInstagram: true },
        },
      },
      order: { id: 'ASC' },
      take: NotificationGateway.UNDELIVERED_POSTS_BATCH_SIZE,
    });

    const getPublishTo = (
      contest: {
        socialPostSettings?: {
          postToTwitter?: boolean;
          postToInstagram?: boolean;
        } | null;
      } | null,
    ) => {
      const s = contest?.socialPostSettings;
      return {
        postToTwitter: s?.postToTwitter ?? false,
        postToInstagram: s?.postToInstagram ?? false,
      };
    };

    if (undeliveredPosts.length > 0) {
      // Post ids the client actually acknowledged receiving.
      const confirmedIds: number[] = [];
      const imageEdits = undeliveredPosts
        .filter(
          (post) =>
            post.imageUrl &&
            !post.videoUrl &&
            Boolean(post.generationParams?.sourceImageUrl),
        )
        .map((post) => ({
          id: post.id,
          imageUrl: post.imageUrl,
          videoUrl: post.videoUrl,
          previewImageUrl: post.previewImageUrl,
          generationParams: post.generationParams,
          publishTo: getPublishTo(post.contest ?? null),
        }));

      const images = undeliveredPosts
        .filter(
          (post) =>
            post.imageUrl &&
            !post.videoUrl &&
            !Boolean(post.generationParams?.sourceImageUrl),
        )
        .map((post) => ({
          id: post.id,
          imageUrl: post.imageUrl,
          videoUrl: post.videoUrl,
          previewImageUrl: post.previewImageUrl,
          generationParams: post.generationParams,
          publishTo: getPublishTo(post.contest ?? null),
        }));

      const memes = undeliveredPosts
        .filter(
          (post) => post.videoUrl && post.generationParams?.memeId != null,
        )
        .map((post) => ({
          id: post.id,
          videoUrl: post.videoUrl,
          previewImageUrl: post.previewImageUrl,
          generationParams: post.generationParams,
          publishTo: getPublishTo(post.contest ?? null),
        }));

      const videos = undeliveredPosts
        .filter(
          (post) =>
            post.videoUrl &&
            !post.hasAudio &&
            post.generationParams?.memeId == null,
        )
        .map((post) => ({
          id: post.id,
          videoUrl: post.videoUrl,
          previewImageUrl: post.previewImageUrl,
          generationParams: post.generationParams,
          publishTo: getPublishTo(post.contest ?? null),
        }));

      const audioVideos = undeliveredPosts
        .filter(
          (post) =>
            post.videoUrl &&
            post.hasAudio &&
            post.generationParams?.memeId == null,
        )
        .map((post) => ({
          id: post.id,
          videoUrl: post.videoUrl,
          previewImageUrl: post.previewImageUrl,
          generationParams: post.generationParams,
          publishTo: getPublishTo(post.contest ?? null),
        }));

      if (images.length > 0 && client.connected) {
        // One event per generation task, mirroring the live imageGenerated
        // payload (top-level taskId); the legacy no-taskId group keeps the
        // exact pre-existing shape.
        for (const [taskId, taskImages] of this.groupByTaskId(images)) {
          const taskGroupIds = taskImages.map((item: any) => item.id);
          const payload: Record<string, unknown> = {
            images: {
              data: taskImages.map(
                ({
                  id,
                  imageUrl,
                  videoUrl,
                  previewImageUrl,
                  generationParams,
                  publishTo,
                }) => ({
                  id,
                  imageUrl,
                  videoUrl: videoUrl || null,
                  previewImageUrl: previewImageUrl || null,
                  // Keep payload key as snake_case for client compatibility.
                  generation_params: generationParams || null,
                  publishTo,
                }),
              ),
            },
          };
          if (taskId) {
            payload.taskId = taskId;
          }
          confirmedIds.push(
            ...(await this.replayToClient(client, 'undeliveredImages', payload, taskGroupIds)),
          );
        }
      }

      if (imageEdits.length > 0 && client.connected) {
        for (const [taskId, taskEdits] of this.groupByTaskId(imageEdits)) {
          const taskGroupIds = taskEdits.map((item: any) => item.id);
          const payload: Record<string, unknown> = {
            images: {
              data: taskEdits.map(
                ({
                  id,
                  imageUrl,
                  videoUrl,
                  previewImageUrl,
                  generationParams,
                  publishTo,
                }) => ({
                  id,
                  imageUrl,
                  videoUrl: videoUrl || null,
                  previewImageUrl: previewImageUrl || null,
                  generation_params: generationParams || null,
                  publishTo,
                }),
              ),
            },
          };
          if (taskId) {
            payload.taskId = taskId;
          }
          confirmedIds.push(
            ...(await this.replayToClient(client, 'undeliveredImageEdits', payload, taskGroupIds)),
          );
        }
      }

      if (videos.length > 0 && client.connected) {
        for (const [taskId, taskVideos] of this.groupByTaskId(videos)) {
          const taskGroupIds = taskVideos.map((item: any) => item.id);
          const payload: Record<string, unknown> = {
            video: {
              data: taskVideos.map(
                ({
                  id,
                  videoUrl,
                  previewImageUrl,
                  generationParams,
                  publishTo,
                }) => ({
                  id,
                  videoUrl,
                  previewImageUrl: previewImageUrl || null,
                  generation_params: generationParams || null,
                  publishTo,
                }),
              ),
            },
          };
          if (taskId) {
            payload.taskId = taskId;
          }
          confirmedIds.push(
            ...(await this.replayToClient(client, 'undeliveredVideo', payload, taskGroupIds)),
          );
        }
      }

      if (audioVideos.length > 0 && client.connected) {
        for (const [taskId, taskAudio] of this.groupByTaskId(audioVideos)) {
          const taskGroupIds = taskAudio.map((item: any) => item.id);
          const payload: Record<string, unknown> = {
            audio: {
              data: taskAudio.map(
                ({
                  id,
                  videoUrl,
                  previewImageUrl,
                  generationParams,
                  publishTo,
                }) => ({
                  id,
                  videoUrl,
                  previewImageUrl: previewImageUrl || null,
                  generation_params: generationParams || null,
                  publishTo,
                }),
              ),
            },
          };
          if (taskId) {
            payload.taskId = taskId;
          }
          confirmedIds.push(
            ...(await this.replayToClient(client, 'undeliveredAudio', payload, taskGroupIds)),
          );
        }
      }

      if (memes.length > 0 && client.connected) {
        for (const [taskId, taskMemes] of this.groupByTaskId(memes)) {
          const taskGroupIds = taskMemes.map((item: any) => item.id);
          const payload: Record<string, unknown> = {
            memes: {
              data: taskMemes.map(
                ({
                  id,
                  videoUrl,
                  previewImageUrl,
                  generationParams,
                  publishTo,
                }) => ({
                  id,
                  videoUrl,
                  previewImageUrl: previewImageUrl || null,
                  generation_params: generationParams || null,
                  publishTo,
                }),
              ),
            },
          };
          if (taskId) {
            payload.taskId = taskId;
          }
          confirmedIds.push(
            ...(await this.replayToClient(client, 'undeliveredMeme', payload, taskGroupIds)),
          );
        }
      }

      // Only what the client confirmed. An unconfirmed batch stays flagged
      // and is replayed on the next join, which is the whole point of the
      // flag; a legacy client cannot confirm, so replayToClient reports its
      // batch as delivered to preserve today's behaviour for un-updated apps.
      await this.markDelivered(confirmedIds);
    }

    const isVerified = Boolean(user.emailVerified);
    await this.emitEmailVerifiedStatus(roomId, isVerified);
  }
  handleConnection(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      client.join(this.getUserRoomId(userId));
    }
  }

  handleDisconnect(@ConnectedSocket() _client: Socket) {}

  isUserConnected(userId: string): boolean {
    return this.getUserRoomSize(userId) > 0;
  }

  async emitProfileUpdate(userId: string) {
    const updatedProfile = await this.userService.getUserProfile(
      Number(userId),
    );

    this.server.to(userId).emit('profileUpdate', updatedProfile);
  }

  async emitEmailVerifiedStatus(userId: string, success: boolean) {
    this.server.to(userId).emit('emailVerified', { success });
  }

  private getUserRoomId(userId: string | number): string {
    return String(userId);
  }

  private getUserRoomSize(userId: string | number): number {
    const roomId = this.getUserRoomId(userId);
    const server = this.server as any;
    const adapter = server?.sockets?.adapter ?? server?.adapter ?? null;
    const room =
      adapter?.rooms instanceof Map
        ? adapter.rooms.get(roomId)
        : adapter?.rooms?.get?.(roomId);

    return room?.size ?? 0;
  }
}
