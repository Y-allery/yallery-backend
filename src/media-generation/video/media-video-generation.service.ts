import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Queue } from 'bullmq';
import { ActivityEnum } from 'src/activity/types/activity.enum';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { Repository } from 'typeorm';
import { MediaGenerationRequestEntity } from '../entities/media-generation-request.entity';
import { FalVideoProvider } from '../providers/fal/fal-video.provider';
import { MediaGenerationCreditsService } from '../shared/media-generation-credits.service';
import { MediaGenerationDeliveryService } from '../shared/media-generation-delivery.service';
import { MediaGenerationTagSelectionService } from '../shared/media-generation-tag-selection.service';
import {
  MediaGenerationModality,
  MediaGenerationProvider,
  MediaGenerationRequestStatus,
} from '../shared/media-generation.types';
import { GenerateMediaVideoDto } from './dto/generate-media-video.dto';
import { MediaVideoPolicyService } from './media-video-policy.service';
import { MediaVideoPostService } from './media-video-post.service';
import { MediaVideoRequestBuilderService } from './media-video-request-builder.service';
import {
  MEDIA_VIDEO_GENERATION_QUEUE,
  MEDIA_VIDEO_SUBMIT_JOB,
} from './media-video.constants';

@Injectable()
export class MediaVideoGenerationService {
  private readonly logger = new Logger(MediaVideoGenerationService.name);

  constructor(
    private readonly falVideoProvider: FalVideoProvider,
    private readonly mediaVideoPolicyService: MediaVideoPolicyService,
    private readonly mediaVideoRequestBuilderService: MediaVideoRequestBuilderService,
    private readonly mediaVideoPostService: MediaVideoPostService,
    private readonly mediaGenerationCreditsService: MediaGenerationCreditsService,
    private readonly mediaGenerationDeliveryService: MediaGenerationDeliveryService,
    private readonly mediaGenerationTagSelectionService: MediaGenerationTagSelectionService,
    private readonly notificationGateway: NotificationGateway,
    @InjectRepository(MediaGenerationRequestEntity)
    private readonly mediaGenerationRequestRepository: Repository<MediaGenerationRequestEntity>,
    @InjectQueue(MEDIA_VIDEO_GENERATION_QUEUE)
    private readonly mediaVideoGenerationQueue: Queue,
  ) {}

  async enqueue(dto: GenerateMediaVideoDto, userId: number): Promise<{
    requestId: string;
    status: MediaGenerationRequestStatus;
  }> {
    const requestId = randomUUID();
    const preparedDto = await this.mediaVideoPolicyService.prepareDto(dto);
    const generationCost = await this.mediaVideoPolicyService.getGenerationCost(
      preparedDto.aiService,
    );

    await this.mediaGenerationCreditsService.verifyUserHasEnoughCredits(
      userId,
      generationCost,
      'Not enough credits to generate video',
    );

    await this.mediaGenerationRequestRepository.save(
      this.mediaGenerationRequestRepository.create({
        id: requestId,
        userId,
        modality: MediaGenerationModality.VIDEO,
        provider: MediaGenerationProvider.FAL,
        providerJobId: null,
        status: MediaGenerationRequestStatus.QUEUED,
        requestPayload: preparedDto as unknown as Record<string, unknown>,
        responsePayload: {
          generationCost,
        },
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        failedAt: null,
      }),
    );

    await this.mediaVideoGenerationQueue.add(
      MEDIA_VIDEO_SUBMIT_JOB,
      { requestId },
      {
        jobId: `submit:${requestId}`,
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );

    return {
      requestId,
      status: MediaGenerationRequestStatus.QUEUED,
    };
  }

  async processSubmitJob(requestId: string): Promise<{
    requestId: string;
    status: MediaGenerationRequestStatus;
    uploadedVideoUrl?: string;
  }> {
    const requestEntity = await this.getRequestOrThrow(requestId);

    if (requestEntity.status === MediaGenerationRequestStatus.COMPLETED) {
      return {
        requestId,
        status: MediaGenerationRequestStatus.COMPLETED,
        uploadedVideoUrl:
          (requestEntity.responsePayload?.uploadedVideoUrl as string) || undefined,
      };
    }

    if (requestEntity.status === MediaGenerationRequestStatus.FAILED) {
      return {
        requestId,
        status: MediaGenerationRequestStatus.FAILED,
      };
    }

    const dto = requestEntity.requestPayload as unknown as GenerateMediaVideoDto;

    await this.mediaGenerationRequestRepository.update(
      { id: requestId },
      {
        status: MediaGenerationRequestStatus.PROCESSING,
        startedAt: requestEntity.startedAt || new Date(),
        errorCode: null,
        errorMessage: null,
        failedAt: null,
      },
    );

    try {
      const request = this.mediaVideoRequestBuilderService.build(dto);
      const result = await this.falVideoProvider.generate(request);
      const generationCost =
        Number(requestEntity.responsePayload?.generationCost) || 0;

      await this.mediaGenerationCreditsService.consumeGenerationCredits({
        userId: requestEntity.userId,
        amount: generationCost,
        activityType: ActivityEnum.VIDEO_GENERATE_SPEND,
      });

      const primaryTag =
        await this.mediaGenerationTagSelectionService.selectBestTag(dto.prompt);

      const created = await this.mediaVideoPostService.createGeneratedPost({
        requestId,
        providerJobId: requestId,
        providerModel: result.providerModel,
        dto,
        request,
        uploadedVideoUrl: result.uploadedVideoUrl,
        userId: requestEntity.userId,
        primaryTag,
      });

      await this.mediaGenerationRequestRepository.update(
        { id: requestId },
        {
          status: MediaGenerationRequestStatus.COMPLETED,
          providerJobId: requestId,
          responsePayload: {
            ...(requestEntity.responsePayload || {}),
            providerModel: result.providerModel,
            uploadedVideoUrl: result.uploadedVideoUrl,
            postId: created.post.id,
          },
          completedAt: new Date(),
          failedAt: null,
          errorCode: null,
          errorMessage: null,
        },
      );

      await this.notificationGateway.sendVideoNotification(
        requestEntity.userId.toString(),
        {
          uploadedVideoUrl: result.uploadedVideoUrl,
          id: created.post.id,
          videoUrl: created.post.videoUrl,
          previewImageUrl: created.post.previewImageUrl,
          generationParams: created.post.generationParams,
          suggestedTags: created.suggestedTags,
          publishTo: created.payloadItem.publishTo,
        },
        ActivityEnum.VIDEO_GENERATE_SPEND,
      );

      return {
        requestId,
        status: MediaGenerationRequestStatus.COMPLETED,
        uploadedVideoUrl: result.uploadedVideoUrl,
      };
    } catch (error) {
      const message = this.readErrorMessage(error);
      this.logger.error(`Failed to process media video request ${requestId}: ${message}`);

      await this.failRequest({
        requestId,
        userId: requestEntity.userId,
        error: message,
      });

      return {
        requestId,
        status: MediaGenerationRequestStatus.FAILED,
      };
    }
  }

  private async failRequest(params: {
    requestId: string;
    userId: number;
    error: string;
  }): Promise<void> {
    await this.mediaGenerationRequestRepository.update(
      { id: params.requestId },
      {
        status: MediaGenerationRequestStatus.FAILED,
        errorCode: 'VIDEO_GENERATION_FAILED',
        errorMessage: params.error,
        failedAt: new Date(),
      },
    );

    await this.mediaGenerationDeliveryService.deliverVideoFailure({
      requestId: params.requestId,
      userId: params.userId,
      error: params.error,
    });
  }

  private async getRequestOrThrow(
    requestId: string,
  ): Promise<MediaGenerationRequestEntity> {
    const requestEntity = await this.mediaGenerationRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!requestEntity) {
      throw new NotFoundException(
        `Media generation request ${requestId} not found`,
      );
    }

    return requestEntity;
  }

  private readErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === 'string' && error.trim()) {
      return error.trim();
    }

    return 'Video generation failed';
  }
}
