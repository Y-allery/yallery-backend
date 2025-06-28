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

@WebSocketGateway({
  cors: {
    origin: '*',
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
    activity_type: ActivityEnum,
  ) {
    if (this.isUserConnected(to_user_id)) {
      this.server.to(to_user_id).emit('imageGenerated', {
        images,
        activity_type,
      });
    } else {
      const postIds = images.data.map((img) => img.id);
      await this.postRepository.update(
        { id: In(postIds) },
        { is_delivered: false },
      );
      console.log(
        `User ${to_user_id} is not connected. Handling offline logic.`,
      );
    }
  }

  async sendVideoNotification(
    to_user_id: string,
    video: any,
    activity_type: ActivityEnum,
  ) {
    if (this.isUserConnected(to_user_id)) {
      this.server.to(to_user_id).emit('videoGenerated', {
        video,
        activity_type,
      });
    } else {
      if (video?.id) {
        await this.postRepository.update(
          { id: video.id },
          { is_delivered: false },
        );
      }
      console.log(
        `User ${to_user_id} is not connected. Handling offline logic for video.`,
      );
    }
  }

  async sendErrorNotification(to_user_id: string, errorMessage: string) {
    this.server.to(to_user_id).emit('error', {
      error: errorMessage,
    });
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;
    const user = await this.userService.findById(userId);

    if (!user) {
      console.log('User ID not found in socket data');
      return;
    }

    this.connectedUsers.set(userId, client);
    client.join(userId);
    console.log(`User ${userId} joined their room`);

    const undeliveredPosts = await this.postRepository.find({
      where: { user: { id: userId }, is_delivered: false },
    });

    if (undeliveredPosts.length > 0) {
      const images = undeliveredPosts
        .filter((post) => post.imageUrl && !post.videoUrl)
        .map((post) => ({
          id: post.id,
          imageUrl: post.imageUrl,
        }));

      const videos = undeliveredPosts
        .filter((post) => post.videoUrl)
        .map((post) => ({
          id: post.id,
          videoUrl: post.videoUrl,
        }));

      // Emit undelivered images if any
      if (images.length > 0 && client.connected) {
        client.emit('undeliveredImages', { images });
        console.log(`Sent undelivered images to user ${userId}`);
      }

      // Emit undelivered videos if any
      for (const video of videos) {
        if (client.connected) {
          client.emit('undeliveredVideo', { video });
          console.log(`Sent undelivered video ${video.id} to user ${userId}`);
        }
      }

      // Update delivery status regardless of connection state
      const allUndeliveredIds = undeliveredPosts.map((post) => post.id);
      await this.postRepository.update(
        { id: In(allUndeliveredIds) },
        { is_delivered: true },
      );
      console.log(
        `Updated delivery status for undelivered posts for user ${userId}`,
      );
    }

    const isVerified = Boolean(user.emailVerified);
    await this.emitEmailVerifiedStatus(userId, isVerified);
  }
  handleConnection(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      this.connectedUsers.set(userId, client);
      console.log(`User ${userId} connected`);
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      this.connectedUsers.delete(userId);
      console.log(`User ${userId} disconnected`);
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
