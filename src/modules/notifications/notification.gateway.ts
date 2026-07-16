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
  constructor(
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
  ) {}

  @WebSocketServer()
  server: Server;

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
      await this.postRepository.update(
        { id: In(postIds) },
        { isDelivered: false },
      );
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

    await this.postRepository.update(
      { id: In(postIds) },
      { isDelivered: false },
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
      await this.postRepository.update(
        { id: video.id },
        { isDelivered: false },
      );
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
      await this.postRepository.update(
        { id: video.id },
        { isDelivered: false },
      );
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

    await this.postRepository.update(
      { id: payload.id },
      { isDelivered: false },
    );
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;
    const roomId = this.getUserRoomId(userId);
    const user = await this.userService.findById(userId);

    if (!user) {
      // User ID not found in socket data
      return;
    }

    client.join(roomId);

    const undeliveredPosts = await this.postRepository.find({
      where: { user: { id: userId }, isDelivered: false },
      relations: ['contest'],
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
        client.emit('undeliveredImages', {
          images: {
            data: images.map(
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
        });
      }

      if (imageEdits.length > 0 && client.connected) {
        client.emit('undeliveredImageEdits', {
          images: {
            data: imageEdits.map(
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
        });
      }

      if (videos.length > 0 && client.connected) {
        client.emit('undeliveredVideo', {
          video: {
            data: videos.map(
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
        });
      }

      if (audioVideos.length > 0 && client.connected) {
        client.emit('undeliveredAudio', {
          audio: {
            data: audioVideos.map(
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
        });
      }

      if (memes.length > 0 && client.connected) {
        client.emit('undeliveredMeme', {
          memes: {
            data: memes.map(
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
        });
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
