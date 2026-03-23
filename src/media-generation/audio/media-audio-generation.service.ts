import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Queue } from 'bullmq';
import { ActivityEnum } from 'src/activity/types/activity.enum';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { Repository } from 'typeorm';
import { MediaGenerationRequestEntity } from '../entities/media-generation-request.entity';
import { FalAudioProvider } from '../providers/fal/fal-audio.provider';
import { MediaGenerationCreditsService } from '../shared/media-generation-credits.service';
import { MediaGenerationDeliveryService } from '../shared/media-generation-delivery.service';
import {
  MediaGenerationModality,
  MediaGenerationProvider,
  MediaGenerationRequestStatus,
} from '../shared/media-generation.types';
import { GenerateMediaAudioDto } from './dto/generate-media-audio.dto';
import { MediaAudioPostService } from './media-audio-post.service';
import { MediaAudioPolicyService } from './media-audio-policy.service';
import { MediaAudioRequestBuilderService } from './media-audio-request-builder.service';
import {
  MEDIA_AUDIO_GENERATION_QUEUE,
  MEDIA_AUDIO_SUBMIT_JOB,
} from './media-audio.constants';

@Injectable()
export class MediaAudioGenerationService {
  private readonly logger = new Logger(MediaAudioGenerationService.name);

  constructor(
    private readonly falAudioProvider: FalAudioProvider,
    private readonly mediaAudioPolicyService: MediaAudioPolicyService,
    private readonly mediaAudioRequestBuilderService: MediaAudioRequestBuilderService,
    private readonly mediaAudioPostService: MediaAudioPostService,
    private readonly mediaGenerationCreditsService: MediaGenerationCreditsService,
    private readonly mediaGenerationDeliveryService: MediaGenerationDeliveryService,
    private readonly notificationGateway: NotificationGateway,
    @InjectRepository(MediaGenerationRequestEntity)
    private readonly mediaGenerationRequestRepository: Repository<MediaGenerationRequestEntity>,
    @InjectQueue(MEDIA_AUDIO_GENERATION_QUEUE)
    private readonly mediaAudioGenerationQueue: Queue,
  ) {}

  async enqueue(dto: GenerateMediaAudioDto, userId: number): Promise<{
    requestId: string;
    status: MediaGenerationRequestStatus;
  }> {
    const requestId = randomUUID();
    const preparedDto = await this.mediaAudioPolicyService.prepareDto(dto);
    const generationCost = await this.mediaAudioPolicyService.getGenerationCost(
      preparedDto.aiService,
    );

    await this.mediaGenerationCreditsService.verifyUserHasEnoughCredits(
      userId,
      generationCost,
      'Not enough credits to generate audio',
    );

    await this.mediaGenerationRequestRepository.save(
      this.mediaGenerationRequestRepository.create({
        id: requestId,
        userId,
        modality: MediaGenerationModality.AUDIO,
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

    await this.mediaAudioGenerationQueue.add(
      MEDIA_AUDIO_SUBMIT_JOB,
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

    const dto = requestEntity.requestPayload as unknown as GenerateMediaAudioDto;

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
      const request = this.mediaAudioRequestBuilderService.build(dto);
      const result = await this.falAudioProvider.generate(request);
      const generationCost = Number(requestEntity.responsePayload?.generationCost) || 0;

      await this.mediaGenerationCreditsService.consumeGenerationCredits({
        userId: requestEntity.userId,
        amount: generationCost,
        activityType: ActivityEnum.VIDEO_GENERATE_SPEND,
      });

      const created = await this.mediaAudioPostService.createGeneratedPost({
        requestId,
        providerJobId: requestId,
        providerModel: result.providerModel,
        dto,
        request,
        uploadedVideoUrl: result.uploadedVideoUrl,
        userId: requestEntity.userId,
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

      await this.notificationGateway.sendAudioNotification(
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
      this.logger.error(`Failed to process media audio request ${requestId}: ${message}`);

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
        errorCode: 'AUDIO_GENERATION_FAILED',
        errorMessage: params.error,
        failedAt: new Date(),
      },
    );

    await this.mediaGenerationDeliveryService.deliverAudioFailure({
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

    return 'Audio generation failed';
  }
}
