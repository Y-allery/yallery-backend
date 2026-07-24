import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContestEntity } from 'src/modules/contests/entity/contest.entity';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { UserActivityEntity } from '../entities/user-activity.entity';
import {
  UserActivityType,
  USER_ACTIVITY_TYPES,
} from '../types/user-activity.constants';
import { getUserActivityDescriptor } from 'src/modules/engagement/user-activity/config/user-activity.registry';

type CreateUserActivityInput = {
  userId: number;
  idempotencyKey?: string | null;
  actorUserId?: number | null;
  type: UserActivityType;
  pointsDelta?: number;
  contestId?: number | null;
  postId?: number | null;
  previewUrl?: string | null;
  payload?: Record<string, any> | null;
};

@Injectable()
export class UserActivityService {
  constructor(
    @InjectRepository(UserActivityEntity)
    private readonly userActivityRepository: Repository<UserActivityEntity>,
  ) {}

  async createActivity(
    input: CreateUserActivityInput,
  ): Promise<UserActivityEntity> {
    const descriptor = getUserActivityDescriptor(input.type);
    const payload = input.payload ?? null;
    const pointsDelta = Number(input.pointsDelta ?? 0);

    const entity = this.userActivityRepository.create({
      idempotencyKey: input.idempotencyKey ?? null,
      user: { id: input.userId },
      actorUser: input.actorUserId ? { id: input.actorUserId } : null,
      type: input.type,
      category: descriptor.category,
      pointsDelta,
      descriptionSnapshot: descriptor.buildDescription(payload, pointsDelta),
      payload,
      post: input.postId ? ({ id: input.postId } as PostEntity) : null,
      contest: input.contestId
        ? ({ id: input.contestId } as ContestEntity)
        : null,
      previewUrl: input.previewUrl ?? null,
      isRead: false,
      readAt: null,
    });

    return await this.userActivityRepository.save(entity);
  }

  async createActivityOnce(
    input: CreateUserActivityInput & { idempotencyKey: string },
  ): Promise<UserActivityEntity> {
    if (!/^[A-Za-z0-9:_-]{8,128}$/.test(input.idempotencyKey)) {
      throw new Error('USER_ACTIVITY_IDEMPOTENCY_KEY_INVALID');
    }
    const existing = await this.userActivityRepository.findOne({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return existing;
    }
    try {
      return await this.createActivity(input);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
      const adopted = await this.userActivityRepository.findOne({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (!adopted) {
        throw new Error('USER_ACTIVITY_IDEMPOTENCY_ADOPTION_FAILED');
      }
      return adopted;
    }
  }

  async createActivities(inputs: CreateUserActivityInput[]): Promise<void> {
    if (!inputs.length) {
      return;
    }

    const entities = inputs.map((input) => {
      const descriptor = getUserActivityDescriptor(input.type);
      const payload = input.payload ?? null;
      const pointsDelta = Number(input.pointsDelta ?? 0);

      return this.userActivityRepository.create({
        user: { id: input.userId },
        actorUser: input.actorUserId ? { id: input.actorUserId } : null,
        type: input.type,
        category: descriptor.category,
        pointsDelta,
        descriptionSnapshot: descriptor.buildDescription(payload, pointsDelta),
        payload,
        post: input.postId ? ({ id: input.postId } as PostEntity) : null,
        contest: input.contestId
          ? ({ id: input.contestId } as ContestEntity)
          : null,
        previewUrl: input.previewUrl ?? null,
        isRead: false,
        readAt: null,
      });
    });

    await this.userActivityRepository.save(entities, { chunk: 500 });
  }

  async logLikeReceived(params: {
    userId: number;
    actorUserId: number;
    pointsDelta: number;
    postId: number;
    previewUrl?: string | null;
  }) {
    return await this.createActivity({
      userId: params.userId,
      actorUserId: params.actorUserId,
      type: USER_ACTIVITY_TYPES.LIKE_RECEIVED,
      pointsDelta: params.pointsDelta,
      postId: params.postId,
      previewUrl: params.previewUrl ?? null,
      payload: {
        postId: params.postId,
      },
    });
  }

  async logLikeSpent(params: {
    userId: number;
    pointsDelta: number;
    postId: number;
    previewUrl?: string | null;
  }) {
    return await this.createActivity({
      userId: params.userId,
      type: USER_ACTIVITY_TYPES.LIKE_SPENT,
      pointsDelta: params.pointsDelta,
      postId: params.postId,
      previewUrl: params.previewUrl ?? null,
      payload: {
        postId: params.postId,
      },
    });
  }

  async logMediaGenerationSpent(params: {
    userId: number;
    pointsDelta: number;
    mediaType: 'image' | 'video' | 'audio' | 'meme';
    mode: string;
    aiService: string;
    quantity?: number;
    orientation?: string | null;
    duration?: number | null;
    contestId?: number | null;
    postId?: number | null;
    previewUrl?: string | null;
  }) {
    return await this.createActivity({
      userId: params.userId,
      type: USER_ACTIVITY_TYPES.MEDIA_GENERATION_SPENT,
      pointsDelta: params.pointsDelta,
      contestId: params.contestId ?? null,
      postId: params.postId ?? null,
      previewUrl: params.previewUrl ?? null,
      payload: {
        mediaType: params.mediaType,
        mode: params.mode,
        aiService: params.aiService,
        quantity: params.quantity ?? 1,
        orientation: params.orientation ?? null,
        duration: params.duration ?? null,
      },
    });
  }

  async logMediaGenerationSpentOnce(
    generationTaskId: string,
    params: {
      userId: number;
      pointsDelta: number;
      mediaType: 'image' | 'video' | 'audio' | 'meme';
      mode: string;
      aiService: string;
      quantity?: number;
      orientation?: string | null;
      duration?: number | null;
      contestId?: number | null;
      postId?: number | null;
      previewUrl?: string | null;
    },
  ) {
    return this.createActivityOnce({
      idempotencyKey: `media_generation:${generationTaskId}`,
      userId: params.userId,
      type: USER_ACTIVITY_TYPES.MEDIA_GENERATION_SPENT,
      pointsDelta: params.pointsDelta,
      contestId: params.contestId ?? null,
      postId: params.postId ?? null,
      previewUrl: params.previewUrl ?? null,
      payload: {
        mediaType: params.mediaType,
        mode: params.mode,
        aiService: params.aiService,
        quantity: params.quantity ?? 1,
        orientation: params.orientation ?? null,
        duration: params.duration ?? null,
      },
    });
  }

  async logContestOpened(params: {
    userIds: number[];
    contestId: number;
    contestName: string;
    contestType: string;
    previewUrl?: string | null;
  }) {
    const uniqueUserIds = Array.from(
      new Set(
        params.userIds
          .map((userId) => Number(userId))
          .filter((userId) => Number.isInteger(userId) && userId > 0),
      ),
    );

    await this.createActivities(
      uniqueUserIds.map((userId) => ({
        userId,
        type: USER_ACTIVITY_TYPES.CONTEST_OPENED,
        contestId: params.contestId,
        previewUrl: params.previewUrl ?? null,
        payload: {
          contestName: params.contestName,
          contestType: params.contestType,
        },
      })),
    );
  }

  async logContestWon(params: {
    userId: number;
    contestId: number;
    contestName: string;
    reward: number;
    postId?: number | null;
    previewUrl?: string | null;
  }) {
    return await this.createActivity({
      userId: params.userId,
      type: USER_ACTIVITY_TYPES.CONTEST_WON,
      pointsDelta: params.reward,
      contestId: params.contestId,
      postId: params.postId ?? null,
      previewUrl: params.previewUrl ?? null,
      payload: {
        contestName: params.contestName,
        reward: params.reward,
      },
    });
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as { code?: unknown; errno?: unknown };
  return (
    candidate.code === 'ER_DUP_ENTRY' ||
    candidate.code === 'SQLITE_CONSTRAINT' ||
    candidate.code === '23505' ||
    candidate.errno === 1062
  );
}
