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
    const promptEnhancement =
      await this.mediaPromptEnhancerService.enhancePrompt({
        prompt: request.prompt,
        styleId: request.styleId ?? null,
        colorId: request.colorId ?? null,
        mode: 'image_generate',
      });
    const resolvedRequest =
      await this.contestMediaGenerationResolverService.resolvePromptImageRequest(
        {
          ...request,
          translatedPrompt: promptEnhancement.translatedPrompt,
          resolvedPrompt: promptEnhancement.enhancedPrompt,
          styleId: promptEnhancement.style?.id ?? request.styleId ?? null,
          colorId: promptEnhancement.color?.id ?? request.colorId ?? null,
          styleName: promptEnhancement.style?.name ?? null,
          colorName: promptEnhancement.color?.name ?? null,
        },
      );
    await this.mediaGenerationGuardsService.assertUserCanGeneratePromptImages(
      resolvedRequest,
      userId,
    );

    const submission = await this.contestFlowService.startSubmission({
      contestId: resolvedRequest.contestId ?? null,
      userId,
      mediaKind: 'image',
      aiService: resolvedRequest.aiService,
      capability: 'image_generate',
    });
    const queuedRequest = {
      ...resolvedRequest,
      contestSubmissionId: submission?.id ?? null,
    };

    try {
      const job = await this.mediaPromptImageQueue.add(
        queuedRequest.aiService,
        {
          request: queuedRequest,
          userId,
          aiService: queuedRequest.aiService,
        },
        this.defaultJobOptions,
      );
      await this.contestFlowService.attachQueueJob(submission?.id, job.id);
      return job;
    } catch (error) {
      await this.contestFlowService.markSubmissionFailed(submission?.id);
      throw error;
    }
  }

  async enqueueImageEditGeneration(
    request: EditImageGenerationRequest,
    userId: number,
  ) {
    const promptEnhancement =
      await this.mediaPromptEnhancerService.enhancePrompt({
        prompt: request.prompt,
        styleId: request.styleId ?? null,
        colorId: request.colorId ?? null,
        mode: 'image_edit',
      });
    const enhancedRequest: EditImageGenerationRequest = {
      ...request,
      translatedPrompt: promptEnhancement.translatedPrompt,
      resolvedPrompt: promptEnhancement.enhancedPrompt,
      styleId: promptEnhancement.style?.id ?? request.styleId ?? null,
      colorId: promptEnhancement.color?.id ?? request.colorId ?? null,
      styleName: promptEnhancement.style?.name ?? null,
      colorName: promptEnhancement.color?.name ?? null,
    };
    await this.mediaGenerationGuardsService.assertUserCanEditImages(
      enhancedRequest,
      userId,
    );

    const submission = await this.contestFlowService.startSubmission({
      contestId: enhancedRequest.contestId ?? null,
      userId,
      mediaKind: 'image',
      aiService: enhancedRequest.aiService,
      capability: 'image_edit',
    });
    const queuedRequest = {
      ...enhancedRequest,
      contestSubmissionId: submission?.id ?? null,
    };

    try {
      const job = await this.mediaImageEditQueue.add(
        queuedRequest.aiService,
        {
          request: queuedRequest,
          userId,
          aiService: queuedRequest.aiService,
        },
        this.defaultJobOptions,
      );
      await this.contestFlowService.attachQueueJob(submission?.id, job.id);
      return job;
    } catch (error) {
      await this.contestFlowService.markSubmissionFailed(submission?.id);
      throw error;
    }
  }

  async enqueueAudioGeneration(
    request: AudioGenerationRequest,
    userId: number,
  ) {
    await this.mediaGenerationGuardsService.assertUserCanGenerateAudio(
      request,
      userId,
    );

    const submission = await this.contestFlowService.startSubmission({
      contestId: request.contestId ?? null,
      userId,
      mediaKind: 'audio',
      aiService: request.aiService,
      capability: 'audio_generate',
    });
    const queuedRequest = {
      ...request,
      contestSubmissionId: submission?.id ?? null,
    };

    try {
      const job = await this.mediaAudioQueue.add(
        queuedRequest.aiService,
        {
          request: queuedRequest,
          userId,
          aiService: queuedRequest.aiService,
        },
        this.defaultJobOptions,
      );
      await this.contestFlowService.attachQueueJob(submission?.id, job.id);
      return job;
    } catch (error) {
      await this.contestFlowService.markSubmissionFailed(submission?.id);
      throw error;
    }
  }

  async enqueueTextVideoGeneration(
    request: TextVideoGenerationRequest,
    userId: number,
  ) {
    await this.mediaGenerationGuardsService.assertUserCanGenerateVideos(
      request,
      userId,
    );

    const submission = await this.contestFlowService.startSubmission({
      contestId: request.contestId ?? null,
      userId,
      mediaKind: 'video',
      aiService: request.aiService,
      capability: 'video_generate',
    });
    const queuedRequest = {
      ...request,
      contestSubmissionId: submission?.id ?? null,
    };

    try {
      const job = await this.mediaTextVideoQueue.add(
        queuedRequest.aiService,
        {
          request: queuedRequest,
          userId,
          aiService: queuedRequest.aiService,
        },
        this.defaultJobOptions,
      );
      await this.contestFlowService.attachQueueJob(submission?.id, job.id);
      return job;
    } catch (error) {
      await this.contestFlowService.markSubmissionFailed(submission?.id);
      throw error;
    }
  }

  async enqueueImageVideoGeneration(
    request: ImageVideoGenerationRequest,
    userId: number,
  ) {
    await this.mediaGenerationGuardsService.assertUserCanGenerateVideos(
      request,
      userId,
    );

    const submission = await this.contestFlowService.startSubmission({
      contestId: request.contestId ?? null,
      userId,
      mediaKind: 'video',
      aiService: request.aiService,
      capability: 'video_generate',
    });
    const queuedRequest = {
      ...request,
      contestSubmissionId: submission?.id ?? null,
    };

    try {
      const job = await this.mediaImageVideoQueue.add(
        queuedRequest.aiService,
        {
          request: queuedRequest,
          userId,
          aiService: queuedRequest.aiService,
        },
        this.defaultJobOptions,
      );
      await this.contestFlowService.attachQueueJob(submission?.id, job.id);
      return job;
    } catch (error) {
      await this.contestFlowService.markSubmissionFailed(submission?.id);
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

    await this.mediaGenerationGuardsService.assertUserCanGenerateMemes(
      enrichedRequest,
      userId,
    );

    return await this.mediaMemeQueue.add(
      enrichedRequest.aiService,
      {
        request: enrichedRequest,
        userId,
        aiService: enrichedRequest.aiService,
      },
      this.defaultJobOptions,
    );
  }
}
