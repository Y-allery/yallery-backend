import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Inject, UseGuards, forwardRef } from '@nestjs/common';
import { WsAuthGuard } from '../auth/guards/ws.auth.guard';
import { ActivityEnum } from 'src/activity/types/activity.enum';
import { UserService } from 'src/user/user.service';
import { In, Repository } from 'typeorm';
import { PostEntity } from 'src/post/entities/post.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { TagEntity } from 'src/tag/entities/tag.entity';

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
    @InjectRepository(TagEntity)
    private readonly tagRepository: Repository<TagEntity>,
  ) {}

  @WebSocketServer()
  server: Server;

  private connectedUsers = new Map<string, Socket>();

  async sendNotification(
    to_user_id: string,
    message: string,
    activity_type: ActivityEnum,
  ) {
    this.server.to(to_user_id).emit('activity', {
      message,
      activity_type,
    });
  }

  async sendImageArrayNotification(
    to_user_id: string,
    images: any,
    activity_type?: ActivityEnum,
    isEdit?: boolean,
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
        this.server.to(to_user_id).emit('imageGenerated', payload);
      } else if (images?.data && Array.isArray(images.data)) {
        if (images.data.length === 0) {
          console.error(`[NotificationGateway] Empty images.data for user ${to_user_id}`);
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
        this.server.to(to_user_id).emit('imageGenerated', payload);
      } else {
        console.error(`[NotificationGateway] Invalid images structure for user ${to_user_id}:`, images);
        return;
      }
    } else {
      if (!images?.data || !Array.isArray(images.data) || images.data.length === 0) {
        console.error(`[NotificationGateway] Invalid images.data structure for offline user ${to_user_id}:`, images);
        return;
      }
      const postIds = images.data.map((img) => img.id).filter((id) => id != null);
      if (postIds.length === 0) {
        console.error(`[NotificationGateway] No valid post IDs found for offline user ${to_user_id}`);
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
  ) {
    if (this.isUserConnected(to_user_id)) {
      if (!images?.data || !Array.isArray(images.data) || images.data.length === 0) {
        console.error(`[NotificationGateway] Invalid image edit payload for user ${to_user_id}:`, images);
        return;
      }

      this.server.to(to_user_id).emit('imageEdited', {
        images: {
          data: images.data,
        },
      });
      return;
    }

    if (!images?.data || !Array.isArray(images.data) || images.data.length === 0) {
      console.error(`[NotificationGateway] Invalid image edit payload for offline user ${to_user_id}:`, images);
      return;
    }

    const postIds = images.data.map((img) => img.id).filter((id) => id != null);
    if (postIds.length === 0) {
      console.error(`[NotificationGateway] No valid image edit post IDs found for offline user ${to_user_id}`);
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
      suggestedTags: { id: number; name: string; imageUrl: string }[];
      publishTo?: { postToTwitter: boolean; postToInstagram: boolean };
    },
    activity_type?: ActivityEnum,
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
      this.server.to(to_user_id).emit('videoGenerated', payload);
    } else {
      const suggestedTagId = video.suggestedTags?.[0]?.id ?? null;
      await this.postRepository.update(
        { id: video.id },
        {
          isDelivered: false,
          ...(suggestedTagId ? { tag: { id: suggestedTagId } } : {}),
        },
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
      suggestedTags: { id: number; name: string; imageUrl: string }[];
      publishTo?: { postToTwitter: boolean; postToInstagram: boolean };
    },
    activity_type?: ActivityEnum,
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
      this.server.to(to_user_id).emit('audioGenerated', payload);
    } else {
      const suggestedTagId = video.suggestedTags?.[0]?.id ?? null;
      await this.postRepository.update(
        { id: video.id },
        {
          isDelivered: false,
          ...(suggestedTagId ? { tag: { id: suggestedTagId } } : {}),
        },
      );
    }
  }

  async sendErrorNotification(to_user_id: string, errorMessage: string) {
    this.server.to(to_user_id).emit('error', {
      error: errorMessage,
    });
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
  ) {
    this.server.to(toUserId).emit('memeGenerated', {
      memes: { data: [payload] },
    });
  }

  /** Meme generation: failed */
  async sendMemeGenerationFailed(
    toUserId: string,
    payload: { jobId: string; error: string },
  ) {
    this.server.to(toUserId).emit('memeGenerationFailed', payload);
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;
    const user = await this.userService.findById(userId);

    if (!user) {
      // User ID not found in socket data
      return;
    }

    this.connectedUsers.set(userId, client);
    client.join(userId);

    const undeliveredPosts = await this.postRepository.find({
      where: { user: { id: userId }, isDelivered: false },
      relations: ['tag', 'contest'],
    });

    const getPublishTo = (contest: { socialPostSettings?: { postToTwitter?: boolean; postToInstagram?: boolean } | null } | null) => {
      const s = contest?.socialPostSettings;
      return {
        postToTwitter: s?.postToTwitter ?? false,
        postToInstagram: s?.postToInstagram ?? false,
      };
    };

    if (undeliveredPosts.length > 0) {
      const OTHER_TAG = {
        id: 48,
        name: '#other',
        imageUrl:
          'https://res.cloudinary.com/dsypundib/image/upload/v1732808917/other_tag-min_qd9y0c.png',
      };

      
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
          tagId: post.tag?.id,
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
          tagId: post.tag?.id,
          publishTo: getPublishTo(post.contest ?? null),
        }));

      
      const memes = undeliveredPosts
        .filter((post) => post.videoUrl && !post.hasAudio && post.generationParams?.memeId != null)
        .map((post) => ({
          id: post.id,
          videoUrl: post.videoUrl,
          previewImageUrl: post.previewImageUrl,
          generationParams: post.generationParams,
          tagId: post.tag?.id,
          publishTo: getPublishTo(post.contest ?? null),
        }));

      const videos = undeliveredPosts
        .filter((post) => post.videoUrl && !post.hasAudio && post.generationParams?.memeId == null)
        .map((post) => ({
          id: post.id,
          videoUrl: post.videoUrl,
          previewImageUrl: post.previewImageUrl,
          generationParams: post.generationParams,
          tagId: post.tag?.id,
          publishTo: getPublishTo(post.contest ?? null),
        }));

      const audioVideos = undeliveredPosts
        .filter((post) => post.videoUrl && post.hasAudio)
        .map((post) => ({
          id: post.id,
          videoUrl: post.videoUrl,
          previewImageUrl: post.previewImageUrl,
          generationParams: post.generationParams,
          tagId: post.tag?.id,
          publishTo: getPublishTo(post.contest ?? null),
        }));

      
      const allTagIds = [
        ...images.map((img) => img.tagId),
        ...imageEdits.map((img) => img.tagId),
        ...memes.map((m) => m.tagId),
        ...videos.map((vid) => vid.tagId),
        ...audioVideos.map((aud) => aud.tagId),
      ]
        .filter((id) => id && id !== 48)
        .filter((id, idx, arr) => arr.indexOf(id) === idx);

      let tagEntities: TagEntity[] = [];
      if (allTagIds.length > 0) {
        tagEntities = await this.tagRepository.findBy({ id: In(allTagIds) });
      }

      if (images.length > 0 && client.connected) {
    
        let suggestedTags = [OTHER_TAG];
        const imageTagIds = images
          .map((img) => img.tagId)
          .filter((id) => id && id !== 48)
          .filter((id, idx, arr) => arr.indexOf(id) === idx);
        for (const tagId of imageTagIds) {
          const foundTag = tagEntities.find((t) => t.id === tagId);
          if (foundTag && !suggestedTags.find((t) => t.id === foundTag.id)) {
            suggestedTags.push({
              id: foundTag.id,
              name: foundTag.name,
              imageUrl: foundTag.imageUrl,
            });
          }
        }
        client.emit('undeliveredImages', {
          images: {
            data: images.map(({ id, imageUrl, videoUrl, previewImageUrl, generationParams, publishTo }) => ({
              id,
              imageUrl,
              videoUrl: videoUrl || null,
              previewImageUrl: previewImageUrl || null,
              // Keep payload key as snake_case for client compatibility.
              generation_params: generationParams || null,
              publishTo,
            })),
          },
        });
      }

      if (imageEdits.length > 0 && client.connected) {
        client.emit('undeliveredImageEdits', {
          images: {
            data: imageEdits.map(({ id, imageUrl, videoUrl, previewImageUrl, generationParams, publishTo }) => ({
              id,
              imageUrl,
              videoUrl: videoUrl || null,
              previewImageUrl: previewImageUrl || null,
              generation_params: generationParams || null,
              publishTo,
            })),
          },
        });
      }

      if (videos.length > 0 && client.connected) {
        let suggestedTags = [OTHER_TAG];
        const videoTagIds = videos
          .map((vid) => vid.tagId)
          .filter((id) => id && id !== 48)
          .filter((id, idx, arr) => arr.indexOf(id) === idx);
        for (const tagId of videoTagIds) {
          const foundTag = tagEntities.find((t) => t.id === tagId);
          if (foundTag && !suggestedTags.find((t) => t.id === foundTag.id)) {
            suggestedTags.push({
              id: foundTag.id,
              name: foundTag.name,
              imageUrl: foundTag.imageUrl,
            });
          }
        }
        client.emit('undeliveredVideo', {
          video: {
            data: videos.map(({ id, videoUrl, previewImageUrl, generationParams, publishTo }) => ({
              id,
              videoUrl,
              previewImageUrl: previewImageUrl || null,
              generation_params: generationParams || null,
              publishTo,
            })),
          },
        });
      }

      if (audioVideos.length > 0 && client.connected) {
        client.emit('undeliveredAudio', {
          audio: {
            data: audioVideos.map(
              ({ id, videoUrl, previewImageUrl, generationParams, publishTo }) => ({
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
        client.emit('undeliveredMemes', {
          memes: {
            data: memes.map(
              ({ id, videoUrl, previewImageUrl, generationParams, publishTo }) => ({
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
    await this.emitEmailVerifiedStatus(userId, isVerified);
  }
  handleConnection(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      this.connectedUsers.set(userId, client);
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      this.connectedUsers.delete(userId);
    }
  }

  isUserConnected(userId: string): boolean {
    return this.connectedUsers.has(userId);
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
}
