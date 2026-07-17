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

  constructor(
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
  ) {}

  @WebSocketServer()
  server: Server;

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
    if (this.isUserConnected(to_user_id)) {
      if (Array.isArray(images)) {
        const payload: Record<string, unknown> = {
          images: { data: images },
        };
        if (activity_type) {
          payload.activity_type = activity_type;
        }
        if (typeof isEdit === 'boolean') {
          payload.isEdit = isEdit;
        }
        if (taskId) {
          payload.taskId = taskId;
        }
        this.server.to(to_user_id).emit('imageGenerated', payload);
      } else if (images?.data && Array.isArray(images.data)) {
        if (images.data.length === 0) {
          console.error(
            `[NotificationGateway] Empty images.data for user ${to_user_id}`,
          );
          return;
        }
        const payload: Record<string, unknown> = {
          images: {
            data: images.data,
          },
        };
        if (activity_type) {
          payload.activity_type = activity_type;
        }
        if (typeof isEdit === 'boolean') {
          payload.isEdit = isEdit;
        }
        if (taskId) {
          payload.taskId = taskId;
        }
        this.server.to(to_user_id).emit('imageGenerated', payload);
      } else {
        console.error(
          `[NotificationGateway] Invalid images structure for user ${to_user_id}:`,
          images,
        );
        return;
      }
    } else {
      if (
        !images?.data ||
        !Array.isArray(images.data) ||
        images.data.length === 0
      ) {
        console.error(
          `[NotificationGateway] Invalid images.data structure for offline user ${to_user_id}:`,
          images,
        );
        return;
      }
      const postIds = images.data
        .map((img) => img.id)
        .filter((id) => id != null);
      if (postIds.length === 0) {
        console.error(
          `[NotificationGateway] No valid post IDs found for offline user ${to_user_id}`,
        );
        return;
      }
      await this.markUndelivered(postIds, taskId);
      // User ${to_user_id} is not connected. Handling offline logic.
    }
  }

  async sendImageEditNotification(
    to_user_id: string,
    images: any,
    taskId?: string,
  ) {
    if (this.isUserConnected(to_user_id)) {
      if (
        !images?.data ||
        !Array.isArray(images.data) ||
        images.data.length === 0
      ) {
        console.error(
          `[NotificationGateway] Invalid image edit payload for user ${to_user_id}:`,
          images,
        );
        return;
      }

      const payload: Record<string, unknown> = {
        images: {
          data: images.data,
        },
      };
      if (taskId) {
        payload.taskId = taskId;
      }
      this.server.to(to_user_id).emit('imageEdited', payload);
      return;
    }

    if (
      !images?.data ||
      !Array.isArray(images.data) ||
      images.data.length === 0
    ) {
      console.error(
        `[NotificationGateway] Invalid image edit payload for offline user ${to_user_id}:`,
        images,
      );
      return;
    }

    const postIds = images.data.map((img) => img.id).filter((id) => id != null);
    if (postIds.length === 0) {
      console.error(
        `[NotificationGateway] No valid image edit post IDs found for offline user ${to_user_id}`,
      );
      return;
    }

    await this.markUndelivered(postIds, taskId);
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
    const generationParams =
      video.generationParams ?? video.generation_params ?? null;
    const publishTo = video.publishTo ?? {
      postToTwitter: false,
      postToInstagram: false,
    };

    if (this.isUserConnected(to_user_id)) {
      const payload: Record<string, unknown> = {
        video: {
          data: [
            {
              id: video.id,
              videoUrl: video.videoUrl || video.uploadedVideoUrl,
              previewImageUrl: video.previewImageUrl || null,
              generationParams,
              publishTo,
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
      this.server.to(to_user_id).emit('videoGenerated', payload);
    } else {
      await this.markUndelivered([video.id], taskId);
    }
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
    const generationParams =
      video.generationParams ?? video.generation_params ?? null;
    const publishTo = video.publishTo ?? {
      postToTwitter: false,
      postToInstagram: false,
    };

    if (this.isUserConnected(to_user_id)) {
      const payload: Record<string, unknown> = {
        audio: {
          data: [
            {
              id: video.id,
              videoUrl: video.videoUrl || video.uploadedVideoUrl,
              previewImageUrl: video.previewImageUrl || null,
              generationParams,
              publishTo,
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
      this.server.to(to_user_id).emit('audioGenerated', payload);
    } else {
      await this.markUndelivered([video.id], taskId);
    }
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
    if (this.isUserConnected(toUserId)) {
      const event: Record<string, unknown> = {
        memes: { data: [payload] },
      };
      if (taskId) {
        event.taskId = taskId;
      }
      this.server.to(toUserId).emit('memeGenerated', event);
      return;
    }

    await this.markUndelivered([payload.id], taskId);
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
          client.emit('undeliveredImages', payload);
        }
      }

      if (imageEdits.length > 0 && client.connected) {
        for (const [taskId, taskEdits] of this.groupByTaskId(imageEdits)) {
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
          client.emit('undeliveredImageEdits', payload);
        }
      }

      if (videos.length > 0 && client.connected) {
        for (const [taskId, taskVideos] of this.groupByTaskId(videos)) {
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
          client.emit('undeliveredVideo', payload);
        }
      }

      if (audioVideos.length > 0 && client.connected) {
        for (const [taskId, taskAudio] of this.groupByTaskId(audioVideos)) {
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
          client.emit('undeliveredAudio', payload);
        }
      }

      if (memes.length > 0 && client.connected) {
        for (const [taskId, taskMemes] of this.groupByTaskId(memes)) {
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
          client.emit('undeliveredMeme', payload);
        }
      }

      const allUndeliveredIds = undeliveredPosts.map((post) => post.id);
      await this.postRepository.update(
        { id: In(allUndeliveredIds) },
        { isDelivered: true },
      );
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
