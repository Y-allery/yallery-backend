import { randomUUID } from 'crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ContestFlowService } from 'src/modules/contests/contest-flow.service';
import {
  MEDIA_AUDIO_GENERATION_QUEUE,
  MEDIA_IMAGE_EDIT_GENERATION_QUEUE,
  MEDIA_IMAGE_VIDEO_GENERATION_QUEUE,
  MEDIA_MEME_GENERATION_QUEUE,
  MEDIA_PROMPT_IMAGE_GENERATION_QUEUE,
  MEDIA_TEXT_VIDEO_GENERATION_QUEUE,
} from 'src/modules/media-generation/infrastructure/queues/constants/media-generation.queue';
import { AudioGenerationRequest } from 'src/modules/media-generation/domain/contracts/audio-generation-request.contract';
import { EditImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/edit-image-generation-request.contract';
import { ImageVideoGenerationRequest } from 'src/modules/media-generation/domain/contracts/image-video-generation-request.contract';
import { MemeGenerationRequest } from 'src/modules/media-generation/domain/contracts/meme-generation-request.contract';
import { PromptImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/prompt-image-generation-request.contract';
import { TextVideoGenerationRequest } from 'src/modules/media-generation/domain/contracts/text-video-generation-request.contract';
import { ContestMediaGenerationResolverService } from 'src/modules/media-generation/application/contest/contest-media-generation-resolver.service';
import { MediaPromptEnhancerService } from 'src/modules/media-generation/application/prompt-enhancement/media-prompt-enhancer.service';
import { MediaGenerationGuardsService } from 'src/modules/media-generation/application/guards/media-generation-guards.service';
import { MediaGenerationBalanceService } from 'src/modules/media-generation/application/balance/media-generation-balance.service';

@Injectable()
export class MediaGenerationEnqueueService {
  private readonly defaultJobOptions = {
    attempts: 2,
    backoff: 30000,
    removeOnComplete: true,
    removeOnFail: false,
  };

  constructor(
    private readonly contestMediaGenerationResolverService: ContestMediaGenerationResolverService,
    private readonly contestFlowService: ContestFlowService,
    private readonly mediaPromptEnhancerService: MediaPromptEnhancerService,
    private readonly mediaGenerationGuardsService: MediaGenerationGuardsService,
    private readonly mediaGenerationBalanceService: MediaGenerationBalanceService,
    @InjectQueue(MEDIA_PROMPT_IMAGE_GENERATION_QUEUE)
    private readonly mediaPromptImageQueue: Queue,
    @InjectQueue(MEDIA_IMAGE_EDIT_GENERATION_QUEUE)
    private readonly mediaImageEditQueue: Queue,
    @InjectQueue(MEDIA_AUDIO_GENERATION_QUEUE)
    private readonly mediaAudioQueue: Queue,
    @InjectQueue(MEDIA_MEME_GENERATION_QUEUE)
    private readonly mediaMemeQueue: Queue,
    @InjectQueue(MEDIA_TEXT_VIDEO_GENERATION_QUEUE)
    private readonly mediaTextVideoQueue: Queue,
    @InjectQueue(MEDIA_IMAGE_VIDEO_GENERATION_QUEUE)
    private readonly mediaImageVideoQueue: Queue,
  ) {}

  async enqueuePromptImageGeneration(
    request: PromptImageGenerationRequest,
    userId: number,
  ) {
    const promptContext = await this.mediaPromptEnhancerService.resolveContext({
      prompt: request.prompt,
      styleId: request.styleId ?? null,
      colorId: request.colorId ?? null,
    });
    const resolvedRequest =
      await this.contestMediaGenerationResolverService.resolvePromptImageRequest(
        {
          ...request,
          prompt: promptContext.prompt,
          style: promptContext.styleDescriptor ?? undefined,
          styleId: promptContext.style?.id ?? request.styleId ?? null,
          colorId: promptContext.color?.id ?? request.colorId ?? null,
          styleName: promptContext.style?.name ?? null,
          colorName: promptContext.color?.name ?? null,
        },
      );
    const totalCost =
      await this.mediaGenerationGuardsService.assertUserCanGeneratePromptImages(
        resolvedRequest,
        userId,
      );

    const chargeKey = randomUUID();
    await this.mediaGenerationBalanceService.reserve({
      userId,
      amount: totalCost,
      chargeKey,
      aiService: resolvedRequest.aiService,
    });

    let submissionId: number | null = null;
    try {
      const submission = await this.contestFlowService.startSubmission({
        contestId: resolvedRequest.contestId ?? null,
        userId,
        mediaKind: 'image',
        aiService: resolvedRequest.aiService,
        capability: 'image_generate',
      });
      submissionId = submission?.id ?? null;
      const queuedRequest = {
        ...resolvedRequest,
        contestSubmissionId: submissionId,
      };

      const job = await this.mediaPromptImageQueue.add(
        queuedRequest.aiService,
        {
          request: queuedRequest,
          userId,
          aiService: queuedRequest.aiService,
          chargeId: chargeKey,
        },
        this.defaultJobOptions,
      );
      await this.contestFlowService.attachQueueJob(submissionId, job.id);
      await this.mediaGenerationBalanceService.attachJob(chargeKey, job.id);
      return job;
    } catch (error) {
      await this.mediaGenerationBalanceService.refund(chargeKey);
      await this.contestFlowService.markSubmissionFailed(submissionId);
      throw error;
    }
  }

  async enqueueImageEditGeneration(
    request: EditImageGenerationRequest,
    userId: number,
  ) {
    const promptContext = await this.mediaPromptEnhancerService.resolveContext({
      prompt: request.prompt,
      styleId: request.styleId ?? null,
      colorId: request.colorId ?? null,
    });
    const enhancedRequest: EditImageGenerationRequest = {
      ...request,
      prompt: promptContext.prompt,
      style: promptContext.styleDescriptor ?? undefined,
      styleId: promptContext.style?.id ?? request.styleId ?? null,
      colorId: promptContext.color?.id ?? request.colorId ?? null,
      styleName: promptContext.style?.name ?? null,
      colorName: promptContext.color?.name ?? null,
    };
    const totalCost =
      await this.mediaGenerationGuardsService.assertUserCanEditImages(
        enhancedRequest,
        userId,
      );

    const chargeKey = randomUUID();
    await this.mediaGenerationBalanceService.reserve({
      userId,
      amount: totalCost,
      chargeKey,
      aiService: enhancedRequest.aiService,
    });

    let submissionId: number | null = null;
    try {
      const submission = await this.contestFlowService.startSubmission({
        contestId: enhancedRequest.contestId ?? null,
        userId,
        mediaKind: 'image',
        aiService: enhancedRequest.aiService,
        capability: 'image_edit',
      });
      submissionId = submission?.id ?? null;
      const queuedRequest = {
        ...enhancedRequest,
        contestSubmissionId: submissionId,
      };

      const job = await this.mediaImageEditQueue.add(
        queuedRequest.aiService,
        {
          request: queuedRequest,
          userId,
          aiService: queuedRequest.aiService,
          chargeId: chargeKey,
        },
        this.defaultJobOptions,
      );
      await this.contestFlowService.attachQueueJob(submissionId, job.id);
      await this.mediaGenerationBalanceService.attachJob(chargeKey, job.id);
      return job;
    } catch (error) {
      await this.mediaGenerationBalanceService.refund(chargeKey);
      await this.contestFlowService.markSubmissionFailed(submissionId);
      throw error;
    }
  }

  async enqueueAudioGeneration(
    request: AudioGenerationRequest,
    userId: number,
  ) {
    const totalCost =
      await this.mediaGenerationGuardsService.assertUserCanGenerateAudio(
        request,
        userId,
      );

    const chargeKey = randomUUID();
    await this.mediaGenerationBalanceService.reserve({
      userId,
      amount: totalCost,
      chargeKey,
      aiService: request.aiService,
    });

    let submissionId: number | null = null;
    try {
      const submission = await this.contestFlowService.startSubmission({
        contestId: request.contestId ?? null,
        userId,
        mediaKind: 'audio',
        aiService: request.aiService,
        capability: 'audio_generate',
      });
      submissionId = submission?.id ?? null;
      const queuedRequest = {
        ...request,
        contestSubmissionId: submissionId,
      };

      const job = await this.mediaAudioQueue.add(
        queuedRequest.aiService,
        {
          request: queuedRequest,
          userId,
          aiService: queuedRequest.aiService,
          chargeId: chargeKey,
        },
        this.defaultJobOptions,
      );
      await this.contestFlowService.attachQueueJob(submissionId, job.id);
      await this.mediaGenerationBalanceService.attachJob(chargeKey, job.id);
      return job;
    } catch (error) {
      await this.mediaGenerationBalanceService.refund(chargeKey);
      await this.contestFlowService.markSubmissionFailed(submissionId);
      throw error;
    }
  }

  async enqueueTextVideoGeneration(
    request: TextVideoGenerationRequest,
    userId: number,
  ) {
    const totalCost =
      await this.mediaGenerationGuardsService.assertUserCanGenerateVideos(
        request,
        userId,
      );

    const chargeKey = randomUUID();
    await this.mediaGenerationBalanceService.reserve({
      userId,
      amount: totalCost,
      chargeKey,
      aiService: request.aiService,
    });

    let submissionId: number | null = null;
    try {
      const submission = await this.contestFlowService.startSubmission({
        contestId: request.contestId ?? null,
        userId,
        mediaKind: 'video',
        aiService: request.aiService,
        capability: 'video_generate',
      });
      submissionId = submission?.id ?? null;
      const queuedRequest = {
        ...request,
        contestSubmissionId: submissionId,
      };

      const job = await this.mediaTextVideoQueue.add(
        queuedRequest.aiService,
        {
          request: queuedRequest,
          userId,
          aiService: queuedRequest.aiService,
          chargeId: chargeKey,
        },
        this.defaultJobOptions,
      );
      await this.contestFlowService.attachQueueJob(submissionId, job.id);
      await this.mediaGenerationBalanceService.attachJob(chargeKey, job.id);
      return job;
    } catch (error) {
      await this.mediaGenerationBalanceService.refund(chargeKey);
      await this.contestFlowService.markSubmissionFailed(submissionId);
      throw error;
    }
  }

  async enqueueImageVideoGeneration(
    request: ImageVideoGenerationRequest,
    userId: number,
  ) {
    const totalCost =
      await this.mediaGenerationGuardsService.assertUserCanGenerateVideos(
        request,
        userId,
      );

    const chargeKey = randomUUID();
    await this.mediaGenerationBalanceService.reserve({
      userId,
      amount: totalCost,
      chargeKey,
      aiService: request.aiService,
    });

    let submissionId: number | null = null;
    try {
      const submission = await this.contestFlowService.startSubmission({
        contestId: request.contestId ?? null,
        userId,
        mediaKind: 'video',
        aiService: request.aiService,
        capability: 'video_generate',
      });
      submissionId = submission?.id ?? null;
      const queuedRequest = {
        ...request,
        contestSubmissionId: submissionId,
      };

      const job = await this.mediaImageVideoQueue.add(
        queuedRequest.aiService,
        {
          request: queuedRequest,
          userId,
          aiService: queuedRequest.aiService,
          chargeId: chargeKey,
        },
        this.defaultJobOptions,
      );
      await this.contestFlowService.attachQueueJob(submissionId, job.id);
      await this.mediaGenerationBalanceService.attachJob(chargeKey, job.id);
      return job;
    } catch (error) {
      await this.mediaGenerationBalanceService.refund(chargeKey);
      await this.contestFlowService.markSubmissionFailed(submissionId);
      throw error;
    }
  }

  async enqueueMemeGeneration(
    request: Omit<MemeGenerationRequest, 'videoUrl'>,
    userId: number,
  ) {
    const meme = await this.mediaGenerationGuardsService.getRequiredMeme(
      request.memeId,
    );
    const enrichedRequest: MemeGenerationRequest = {
      ...request,
      videoUrl: meme.referenceVideoUrl,
    };

    const totalCost =
      await this.mediaGenerationGuardsService.assertUserCanGenerateMemes(
        enrichedRequest,
        userId,
      );

    const chargeKey = randomUUID();
    await this.mediaGenerationBalanceService.reserve({
      userId,
      amount: totalCost,
      chargeKey,
      aiService: enrichedRequest.aiService,
    });

    try {
      const job = await this.mediaMemeQueue.add(
        enrichedRequest.aiService,
        {
          request: enrichedRequest,
          userId,
          aiService: enrichedRequest.aiService,
          chargeId: chargeKey,
        },
        this.defaultJobOptions,
      );
      await this.mediaGenerationBalanceService.attachJob(chargeKey, job.id);
      return job;
    } catch (error) {
      await this.mediaGenerationBalanceService.refund(chargeKey);
      throw error;
    }
  }
}
