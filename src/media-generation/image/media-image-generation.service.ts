import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Queue } from 'bullmq';
import { ActivityEnum } from 'src/activity/types/activity.enum';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { Repository } from 'typeorm';
import { UploadV2Service } from 'src/upload-v2/upload-v2.service';
import { MediaGenerationRequestEntity } from '../entities/media-generation-request.entity';
import { MediaGenerationCreditsService } from '../shared/media-generation-credits.service';
import { MediaGenerationDeliveryService } from '../shared/media-generation-delivery.service';
import {
  MediaGenerationModality,
  MediaGenerationProvider,
  MediaGenerationRequestStatus,
} from '../shared/media-generation.types';
import {
  RunpodGeneratedImageAsset,
  RunpodImageGenerationStatus,
} from '../providers/runpod/runpod.types';
import { RunpodImageProvider } from '../providers/runpod/runpod-image.provider';
import { GenerateMediaImageDto } from './dto/generate-media-image.dto';
import { MediaImagePostService } from './media-image-post.service';
import { MediaImagePolicyService } from './media-image-policy.service';
import { MediaImageRequestBuilderService } from './media-image-request-builder.service';
import {
  MEDIA_IMAGE_GENERATION_QUEUE,
  MEDIA_IMAGE_MAX_INVISIBLE_STATUS_ATTEMPTS,
  MEDIA_IMAGE_MAX_POLL_ATTEMPTS,
  MEDIA_IMAGE_MAX_STUCK_QUEUE_ATTEMPTS,
  MEDIA_IMAGE_POLL_DELAY_MS,
  MEDIA_IMAGE_POLL_JOB,
  MEDIA_IMAGE_POLICY_AI_SERVICE,
  MEDIA_IMAGE_SUBMIT_JOB,
} from './media-image.constants';

@Injectable()
export class MediaImageGenerationService {
  private readonly logger = new Logger(MediaImageGenerationService.name);

  constructor(
    private readonly runpodImageProvider: RunpodImageProvider,
    private readonly uploadV2Service: UploadV2Service,
    private readonly mediaImageRequestBuilderService: MediaImageRequestBuilderService,
    private readonly mediaImagePostService: MediaImagePostService,
    private readonly mediaImagePolicyService: MediaImagePolicyService,
    private readonly mediaGenerationCreditsService: MediaGenerationCreditsService,
    private readonly mediaGenerationDeliveryService: MediaGenerationDeliveryService,
    private readonly notificationGateway: NotificationGateway,
    @InjectRepository(MediaGenerationRequestEntity)
    private readonly mediaGenerationRequestRepository: Repository<MediaGenerationRequestEntity>,
    @InjectQueue(MEDIA_IMAGE_GENERATION_QUEUE)
    private readonly mediaImageGenerationQueue: Queue,
  ) {}

  async generate(dto: GenerateMediaImageDto): Promise<{
    images: string[];
    jobId: string;
    providerModel: string;
  }> {
    const preparedDto = await this.mediaImagePolicyService.prepareDto(dto);
    const request = await this.mediaImageRequestBuilderService.build(preparedDto);
    const result = await this.generateUploadedImages(request);

    return {
      images: result.images,
      jobId: result.jobId,
      providerModel: result.providerModel,
    };
  }

  async enqueue(dto: GenerateMediaImageDto, userId: number): Promise<{
    requestId: string;
    status: MediaGenerationRequestStatus;
  }> {
    const requestId = randomUUID();
    const preparedDto = await this.mediaImagePolicyService.prepareDto(dto);
    const generationCost = await this.mediaImagePolicyService.getGenerationCost(
      preparedDto.imageQuantity ?? 1,
    );

    await this.mediaGenerationCreditsService.verifyUserHasEnoughCredits(
      userId,
      generationCost,
    );

    await this.mediaGenerationRequestRepository.save(
      this.mediaGenerationRequestRepository.create({
        id: requestId,
        userId,
        modality: MediaGenerationModality.IMAGE,
        provider: MediaGenerationProvider.RUNPOD,
        providerJobId: null,
        status: MediaGenerationRequestStatus.QUEUED,
        requestPayload: preparedDto as unknown as Record<string, unknown>,
        responsePayload: {
          policyAiService: MEDIA_IMAGE_POLICY_AI_SERVICE,
          generationCost,
        },
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        failedAt: null,
      }),
    );

    await this.enqueueSubmitJob(requestId);

    return {
      requestId,
      status: MediaGenerationRequestStatus.QUEUED,
    };
  }

  async processSubmitJob(requestId: string): Promise<{
    requestId: string;
    status: MediaGenerationRequestStatus;
    jobId: string;
    providerModel: string;
    imageCount: number;
  }> {
    const requestEntity = await this.getRequestOrThrow(requestId);

    if (requestEntity.status === MediaGenerationRequestStatus.COMPLETED) {
      return this.buildTerminalSummary(requestEntity);
    }

    if (requestEntity.status === MediaGenerationRequestStatus.FAILED) {
      return this.buildFailedSummary(requestEntity);
    }

    if (
      requestEntity.status === MediaGenerationRequestStatus.PROCESSING &&
      requestEntity.providerJobId
    ) {
      await this.enqueuePollJob(requestId, 0);

      return {
        requestId,
        status: MediaGenerationRequestStatus.PROCESSING,
        jobId: requestEntity.providerJobId,
        providerModel:
          (requestEntity.responsePayload?.providerModel as string) || 'default',
        imageCount: 0,
      };
    }

    const dto = this.readDto(requestEntity);

    await this.mediaGenerationRequestRepository.update(
      { id: requestId },
      {
        status: MediaGenerationRequestStatus.PROCESSING,
        startedAt: requestEntity.startedAt || new Date(),
        failedAt: null,
        errorCode: null,
        errorMessage: null,
      },
    );

    try {
      const request = await this.mediaImageRequestBuilderService.build(dto);
      const queuedJob = await this.runpodImageProvider.submitGeneration({
        prompt: request.prompt,
        negativePrompt: request.negativePrompt,
        width: request.width,
        height: request.height,
        imageQuantity: request.imageQuantity,
      });

      await this.mediaGenerationRequestRepository.update(
        { id: requestId },
        {
          status: MediaGenerationRequestStatus.PROCESSING,
          providerJobId: queuedJob.jobId,
          responsePayload: {
            ...(requestEntity.responsePayload || {}),
            providerModel: queuedJob.providerModel,
            rawStatus: 'SUBMITTED',
          },
        },
      );

      await this.enqueuePollJob(requestId, 0);

      return {
        requestId,
        status: MediaGenerationRequestStatus.PROCESSING,
        jobId: queuedJob.jobId,
        providerModel: queuedJob.providerModel,
        imageCount: 0,
      };
    } catch (error) {
      const message = this.readErrorMessage(error);
      this.logger.error(`Failed to submit media image request ${requestId}: ${message}`);

      await this.failRequest({
        requestId,
        userId: requestEntity.userId,
        error: message,
      });

      return {
        requestId,
        status: MediaGenerationRequestStatus.FAILED,
        jobId: '',
        providerModel:
          (requestEntity.responsePayload?.providerModel as string) || 'default',
        imageCount: 0,
      };
    }
  }

  async processPollJob(
    requestId: string,
    attempt: number,
  ): Promise<{
    requestId: string;
    status: MediaGenerationRequestStatus;
    jobId: string;
    imageCount: number;
  }> {
    const requestEntity = await this.getRequestOrThrow(requestId);

    if (requestEntity.status === MediaGenerationRequestStatus.COMPLETED) {
      return this.buildTerminalSummary(requestEntity);
    }

    if (requestEntity.status === MediaGenerationRequestStatus.FAILED) {
      return this.buildFailedSummary(requestEntity);
    }

    if (!requestEntity.providerJobId) {
      if (attempt >= MEDIA_IMAGE_MAX_POLL_ATTEMPTS) {
        await this.failRequest({
          requestId,
          userId: requestEntity.userId,
          error: 'RunPod job id was not created before polling timed out',
        });

        return {
          requestId,
          status: MediaGenerationRequestStatus.FAILED,
          jobId: '',
          imageCount: 0,
        };
      }

      await this.enqueuePollJob(requestId, attempt + 1);

      return {
        requestId,
        status: MediaGenerationRequestStatus.PROCESSING,
        jobId: '',
        imageCount: 0,
      };
    }

    if (attempt >= MEDIA_IMAGE_MAX_POLL_ATTEMPTS) {
      await this.failRequest({
        requestId,
        userId: requestEntity.userId,
        error: `RunPod job ${requestEntity.providerJobId} did not complete in time`,
      });

      return {
        requestId,
        status: MediaGenerationRequestStatus.FAILED,
        jobId: requestEntity.providerJobId,
        imageCount: 0,
      };
    }

    try {
      const status = await this.runpodImageProvider.getGenerationStatus(
        requestEntity.providerJobId,
      );

      if (status.state === 'pending') {
        if (this.shouldFailInvisibleStatus(status, attempt)) {
          await this.failRequest({
            requestId,
            userId: requestEntity.userId,
            error: await this.buildInvisibleStatusError(requestEntity),
          });

          return {
            requestId,
            status: MediaGenerationRequestStatus.FAILED,
            jobId: requestEntity.providerJobId,
            imageCount: 0,
          };
        }

        if (await this.shouldFailStuckQueuedStatus(status, attempt)) {
          await this.failRequest({
            requestId,
            userId: requestEntity.userId,
            error: await this.buildStuckQueueError(requestEntity),
          });

          return {
            requestId,
            status: MediaGenerationRequestStatus.FAILED,
            jobId: requestEntity.providerJobId,
            imageCount: 0,
          };
        }

        await this.persistPendingStatus(requestEntity, status);
        await this.enqueuePollJob(requestId, attempt + 1);

        return {
          requestId,
          status: MediaGenerationRequestStatus.PROCESSING,
          jobId: requestEntity.providerJobId,
          imageCount: 0,
        };
      }

      if (status.state === 'failed') {
        await this.failRequest({
          requestId,
          userId: requestEntity.userId,
          error:
            status.error ||
            `RunPod job ${requestEntity.providerJobId} failed with status ${status.rawStatus}`,
        });

        return {
          requestId,
          status: MediaGenerationRequestStatus.FAILED,
          jobId: requestEntity.providerJobId,
          imageCount: 0,
        };
      }

      let imageCount: number;
      try {
        imageCount = await this.completeRequest(requestEntity, status);
      } catch (error) {
        const message = this.readErrorMessage(error);
        this.logger.error(
          `Failed to finalize media image request ${requestId}: ${message}`,
        );

        await this.failRequest({
          requestId,
          userId: requestEntity.userId,
          error: message,
        });

        return {
          requestId,
          status: MediaGenerationRequestStatus.FAILED,
          jobId: requestEntity.providerJobId,
          imageCount: 0,
        };
      }

      return {
        requestId,
        status: MediaGenerationRequestStatus.COMPLETED,
        jobId: requestEntity.providerJobId,
        imageCount,
      };
    } catch (error) {
      const message = this.readErrorMessage(error);
      this.logger.error(
        `Failed to poll media image request ${requestId}: ${message}`,
      );

      await this.enqueuePollJob(requestId, attempt + 1);

      return {
        requestId,
        status: MediaGenerationRequestStatus.PROCESSING,
        jobId: requestEntity.providerJobId,
        imageCount: 0,
      };
    }
  }

  private async generateUploadedImages(request: {
    prompt: string;
    negativePrompt: string;
    width: number;
    height: number;
    imageQuantity: number;
  }): Promise<{
    images: string[];
    jobId: string;
    providerModel: string;
  }> {
    const result = await this.runpodImageProvider.generate({
      prompt: request.prompt,
      negativePrompt: request.negativePrompt,
      width: request.width,
      height: request.height,
      imageQuantity: request.imageQuantity,
    });

    const images = await this.uploadGeneratedAssets(result.assets);

    return {
      images,
      jobId: result.jobId,
      providerModel: result.providerModel,
    };
  }

  private async uploadGeneratedAssets(
    assets: RunpodGeneratedImageAsset[],
  ): Promise<string[]> {
    return Promise.all(assets.map((asset) => this.uploadAsset(asset)));
  }

  private async uploadAsset(asset: RunpodGeneratedImageAsset): Promise<string> {
    if (asset.kind === 'url' && asset.url) {
      return this.uploadV2Service.uploadImageUrl(asset.url);
    }

    if (asset.kind === 'base64' && asset.base64) {
      const buffer = Buffer.from(asset.base64, 'base64');
      return this.uploadV2Service.uploadImageBuffer(
        buffer,
        asset.mimeType || 'image/png',
      );
    }

    throw new Error(`Unsupported RunPod asset: ${JSON.stringify(asset)}`);
  }

  private readDto(
    requestEntity: MediaGenerationRequestEntity,
  ): GenerateMediaImageDto {
    const payload = requestEntity.requestPayload;
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException(
        `Request payload for ${requestEntity.id} is invalid`,
      );
    }

    return payload as unknown as GenerateMediaImageDto;
  }

  private readErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === 'string' && error.trim()) {
      return error.trim();
    }

    return 'Image generation failed';
  }

  private async enqueueSubmitJob(requestId: string): Promise<void> {
    await this.mediaImageGenerationQueue.add(
      MEDIA_IMAGE_SUBMIT_JOB,
      { requestId },
      {
        jobId: `submit:${requestId}`,
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
  }

  private async enqueuePollJob(requestId: string, attempt: number): Promise<void> {
    await this.mediaImageGenerationQueue.add(
      MEDIA_IMAGE_POLL_JOB,
      { requestId, attempt },
      {
        jobId: `poll:${requestId}:${attempt}`,
        attempts: 1,
        delay: MEDIA_IMAGE_POLL_DELAY_MS,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
  }

  private shouldFailInvisibleStatus(
    status: RunpodImageGenerationStatus,
    attempt: number,
  ): boolean {
    return (
      status.rawStatus === 'REQUEST_NOT_VISIBLE' &&
      attempt >= MEDIA_IMAGE_MAX_INVISIBLE_STATUS_ATTEMPTS
    );
  }

  private async shouldFailStuckQueuedStatus(
    status: RunpodImageGenerationStatus,
    attempt: number,
  ): Promise<boolean> {
    if (
      status.rawStatus !== 'IN_QUEUE' ||
      attempt < MEDIA_IMAGE_MAX_STUCK_QUEUE_ATTEMPTS
    ) {
      return false;
    }

    try {
      const health = await this.runpodImageProvider.getEndpointHealth();
      const inQueue = health.jobs?.inQueue ?? 0;
      const ready = health.workers?.ready ?? 0;
      const running = health.workers?.running ?? 0;
      const initializing = health.workers?.initializing ?? 0;

      return inQueue > 0 && ready === 0 && running === 0 && initializing === 0;
    } catch {
      return false;
    }
  }

  private async buildInvisibleStatusError(
    requestEntity: MediaGenerationRequestEntity,
  ): Promise<string> {
    try {
      const health = await this.runpodImageProvider.getEndpointHealth();
      const inQueue = health.jobs?.inQueue ?? 0;
      const inProgress = health.jobs?.inProgress ?? 0;
      const ready = health.workers?.ready ?? 0;
      const running = health.workers?.running ?? 0;
      const throttled = health.workers?.throttled ?? 0;

      return [
        `RunPod job ${requestEntity.providerJobId} never became visible on the status endpoint.`,
        `Endpoint health: inQueue=${inQueue}, inProgress=${inProgress}, ready=${ready}, running=${running}, throttled=${throttled}.`,
      ].join(' ');
    } catch (error) {
      const fallback = this.readErrorMessage(error);
      return [
        `RunPod job ${requestEntity.providerJobId} never became visible on the status endpoint.`,
        `Additionally, endpoint health lookup failed: ${fallback}.`,
      ].join(' ');
    }
  }

  private async buildStuckQueueError(
    requestEntity: MediaGenerationRequestEntity,
  ): Promise<string> {
    try {
      const health = await this.runpodImageProvider.getEndpointHealth();
      const inQueue = health.jobs?.inQueue ?? 0;
      const ready = health.workers?.ready ?? 0;
      const running = health.workers?.running ?? 0;
      const initializing = health.workers?.initializing ?? 0;
      const throttled = health.workers?.throttled ?? 0;

      return [
        `RunPod job ${requestEntity.providerJobId} stayed queued for too long without an available worker.`,
        `Endpoint health: inQueue=${inQueue}, ready=${ready}, running=${running}, initializing=${initializing}, throttled=${throttled}.`,
      ].join(' ');
    } catch (error) {
      const fallback = this.readErrorMessage(error);
      return [
        `RunPod job ${requestEntity.providerJobId} stayed queued for too long without an available worker.`,
        `Additionally, endpoint health lookup failed: ${fallback}.`,
      ].join(' ');
    }
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

  private buildTerminalSummary(requestEntity: MediaGenerationRequestEntity) {
    return {
      requestId: requestEntity.id,
      status: MediaGenerationRequestStatus.COMPLETED,
      jobId: requestEntity.providerJobId || '',
      providerModel:
        (requestEntity.responsePayload?.providerModel as string) || 'default',
      imageCount:
        Array.isArray(requestEntity.responsePayload?.imageUrls)
          ? (requestEntity.responsePayload?.imageUrls as unknown[]).length
          : 0,
    };
  }

  private buildFailedSummary(requestEntity: MediaGenerationRequestEntity) {
    return {
      requestId: requestEntity.id,
      status: MediaGenerationRequestStatus.FAILED,
      jobId: requestEntity.providerJobId || '',
      providerModel:
        (requestEntity.responsePayload?.providerModel as string) || 'default',
      imageCount: 0,
    };
  }

  private async persistPendingStatus(
    requestEntity: MediaGenerationRequestEntity,
    status: RunpodImageGenerationStatus,
  ): Promise<void> {
    await this.mediaGenerationRequestRepository.update(
      { id: requestEntity.id },
      {
        status: MediaGenerationRequestStatus.PROCESSING,
        providerJobId: requestEntity.providerJobId,
        responsePayload: {
          ...(requestEntity.responsePayload || {}),
          generationCost:
            requestEntity.responsePayload?.generationCost ?? undefined,
          providerModel: status.providerModel,
          rawStatus: status.rawStatus,
        },
      },
    );
  }

  private async completeRequest(
    requestEntity: MediaGenerationRequestEntity,
    status: RunpodImageGenerationStatus,
  ): Promise<number> {
    if (!status.assets?.length || !requestEntity.providerJobId) {
      throw new BadRequestException(
        `RunPod did not return assets for completed request ${requestEntity.id}`,
      );
    }

    const dto = this.readDto(requestEntity);
    const request = await this.mediaImageRequestBuilderService.build(dto);
    const images = await this.uploadGeneratedAssets(status.assets);
    const generationCost = await this.readGenerationCost(
      requestEntity,
      dto.imageQuantity ?? request.imageQuantity,
    );

    await this.mediaGenerationCreditsService.consumeGenerationCredits({
      userId: requestEntity.userId,
      amount: generationCost,
      activityType: ActivityEnum.IMAGE_GENERATE_SPEND,
    });

    const created = await this.mediaImagePostService.createGeneratedPosts({
      requestId: requestEntity.id,
      providerJobId: requestEntity.providerJobId,
      providerModel: status.providerModel,
      dto,
      request,
      imageUrls: images,
      userId: requestEntity.userId,
    });

    await this.mediaGenerationRequestRepository.update(
      { id: requestEntity.id },
      {
        status: MediaGenerationRequestStatus.COMPLETED,
        providerJobId: requestEntity.providerJobId,
        responsePayload: {
          ...(requestEntity.responsePayload || {}),
          generationCost,
          providerModel: status.providerModel,
          rawStatus: status.rawStatus,
          imageUrls: images,
          postIds: created.posts.map((post) => post.id),
        },
        completedAt: new Date(),
        failedAt: null,
        errorCode: null,
        errorMessage: null,
      },
    );

    await this.notificationGateway.sendImageArrayNotification(
      requestEntity.userId.toString(),
      { data: created.payloadItems },
      ActivityEnum.IMAGE_GENERATE_SPEND,
      false,
      { requestId: requestEntity.id },
    );

    return created.posts.length;
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
        errorCode: 'IMAGE_GENERATION_FAILED',
        errorMessage: params.error,
        failedAt: new Date(),
      },
    );

    await this.mediaGenerationDeliveryService.deliverImageFailure({
      requestId: params.requestId,
      userId: params.userId,
      error: params.error,
    });
  }

  private async readGenerationCost(
    requestEntity: MediaGenerationRequestEntity,
    quantity: number,
  ): Promise<number> {
    const storedCost = Number(requestEntity.responsePayload?.generationCost);
    if (Number.isFinite(storedCost) && storedCost >= 0) {
      return storedCost;
    }

    return this.mediaImagePolicyService.getGenerationCost(quantity);
  }
}
