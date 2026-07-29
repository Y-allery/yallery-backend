import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ContestFlowService } from 'src/modules/contests/contest-flow.service';
import { ContestEntity } from 'src/modules/contests/entity/contest.entity';
import { UserActivityService } from 'src/modules/engagement/user-activity/services/user-activity.service';
import { Repository } from 'typeorm';
import { getAudioGenerationPreset } from 'src/modules/media-generation/domain/presets';
import { AudioGenerationRequest } from 'src/modules/media-generation/domain/contracts/audio-generation-request.contract';
import { EditImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/edit-image-generation-request.contract';
import { ImageVideoGenerationRequest } from 'src/modules/media-generation/domain/contracts/image-video-generation-request.contract';
import { MemeGenerationRequest } from 'src/modules/media-generation/domain/contracts/meme-generation-request.contract';
import { ResolvedPromptImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/prompt-image-generation-request.contract';
import { TextVideoGenerationRequest } from 'src/modules/media-generation/domain/contracts/text-video-generation-request.contract';
import { GeneratedPostFactory } from 'src/modules/media-generation/infrastructure/posts/generated-post.factory';
import { MediaGenerationExecutionService } from 'src/modules/media-generation/application/execution/media-generation-execution.service';
import { MediaGenerationGuardsService } from 'src/modules/media-generation/application/guards/media-generation-guards.service';
import { MediaGenerationPricingService } from 'src/modules/media-generation/application/pricing/media-generation-pricing.service';
import { MediaTagResolverService } from 'src/modules/media-generation/infrastructure/tagging/media-tag-resolver.service';
import { PartnershipActivityLoggerService } from 'src/modules/partnership-activity/partnership-activity-logger.service';
import { VideoGenerationResult } from 'src/modules/media-generation/domain/contracts/video-generation-result.contract';
import { PostEntity } from 'src/modules/posts/entities/post.entity';

@Injectable()
export class MediaGenerationFinalizeService {
  constructor(
    private readonly contestFlowService: ContestFlowService,
    private readonly generatedPostFactory: GeneratedPostFactory,
    private readonly mediaGenerationExecutionService: MediaGenerationExecutionService,
    private readonly mediaGenerationGuardsService: MediaGenerationGuardsService,
    private readonly mediaGenerationPricingService: MediaGenerationPricingService,
    private readonly mediaTagResolverService: MediaTagResolverService,
    private readonly userActivityService: UserActivityService,
    private readonly partnershipActivityLogger: PartnershipActivityLoggerService,
    @InjectRepository(ContestEntity)
    private readonly contestRepository: Repository<ContestEntity>,
  ) {}

  async finalizePromptImageGeneration(
    request: ResolvedPromptImageGenerationRequest,
    userId: number,
  ) {
    const result =
      await this.mediaGenerationExecutionService.generatePromptImages(request);
    const user =
      await this.mediaGenerationGuardsService.getRequiredUser(userId);
    const totalCost =
      await this.mediaGenerationPricingService.getPromptImageCost(
        request.aiService,
        request.imageQuantity,
      );

    const publishTo = await this.getContestPublishTo(request.contestId ?? null);
    const resolvedTag = await this.mediaTagResolverService.resolveTagForPrompt(
      request.translatedPrompt ?? request.prompt,
      request.contestId ?? null,
    );
    const posts = await Promise.all(
      result.imageUrls.map(async (imageUrl) => {
        return await this.generatedPostFactory.createPromptImagePost(
          request,
          user.id,
          imageUrl,
          resolvedTag,
        );
      }),
    );

    const savedPosts = await this.contestFlowService.completeGenerationPosts(
      request.contestSubmissionId,
      posts,
    );
    await this.partnershipActivityLogger.logOnceForUser(
      user.id,
      'image_generated',
    );
    const primaryPost = savedPosts[0] ?? null;
    await this.userActivityService.logMediaGenerationSpent({
      userId: user.id,
      pointsDelta: -totalCost,
      mediaType: 'image',
      mode: 'prompt_generation',
      aiService: request.aiService,
      quantity: request.imageQuantity,
      orientation: request.orientation,
      contestId: request.contestId ?? null,
      postId: primaryPost?.id ?? null,
      previewUrl: primaryPost?.imageUrl ?? primaryPost?.previewImageUrl ?? null,
    });

    return {
      data: savedPosts.map((post) => ({
        id: post.id,
        imageUrl: post.imageUrl,
        videoUrl: post.videoUrl,
        previewImageUrl: post.previewImageUrl,
        generationParams: post.generationParams,
        publishTo,
      })),
      rawOutput: result.rawOutput,
    };
  }

  async finalizeImageEditGeneration(
    request: EditImageGenerationRequest,
    userId: number,
  ) {
    const result =
      await this.mediaGenerationExecutionService.editImages(request);
    const user =
      await this.mediaGenerationGuardsService.getRequiredUser(userId);
    // Same reference count the guard reserved against — keeping the reserve/settle pair in
    // lockstep is what stops a future per-reference price from creating a money bug.
    const totalCost = await this.mediaGenerationPricingService.getImageEditCost(
      request.aiService,
      request.imageUrls?.length ?? 1,
    );

    const publishTo = await this.getContestPublishTo(request.contestId ?? null);
    const resolvedTag = await this.mediaTagResolverService.resolveTagForPrompt(
      request.translatedPrompt ?? request.prompt,
      request.contestId ?? null,
    );
    const posts = await Promise.all(
      result.imageUrls.map(async (imageUrl) => {
        return await this.generatedPostFactory.createEditedImagePost(
          request,
          user.id,
          imageUrl,
          resolvedTag,
        );
      }),
    );

    const savedPosts = await this.contestFlowService.completeGenerationPosts(
      request.contestSubmissionId,
      posts,
    );
    await this.partnershipActivityLogger.logOnceForUser(
      user.id,
      'image_generated',
    );
    const primaryPost = savedPosts[0] ?? null;
    await this.userActivityService.logMediaGenerationSpent({
      userId: user.id,
      pointsDelta: -totalCost,
      mediaType: 'image',
      mode: 'image_edit',
      aiService: request.aiService,
      quantity: result.imageUrls.length,
      contestId: request.contestId ?? null,
      postId: primaryPost?.id ?? null,
      previewUrl: primaryPost?.imageUrl ?? primaryPost?.previewImageUrl ?? null,
    });

    return {
      data: savedPosts.map((post) => ({
        id: post.id,
        imageUrl: post.imageUrl,
        videoUrl: post.videoUrl,
        previewImageUrl: post.previewImageUrl,
        generationParams: post.generationParams,
        publishTo,
      })),
      rawOutput: result.rawOutput,
    };
  }

  async finalizeAudioGeneration(
    request: AudioGenerationRequest,
    userId: number,
  ) {
    const result =
      await this.mediaGenerationExecutionService.generateAudio(request);
    const user =
      await this.mediaGenerationGuardsService.getRequiredUser(userId);
    const totalCost = await this.mediaGenerationPricingService.getAudioCost(
      request.aiService,
    );

    const publishTo = await this.getContestPublishTo(request.contestId ?? null);
    const audioPreset = getAudioGenerationPreset(request.aiService);
    const resolvedTag = await this.mediaTagResolverService.resolveTagForPrompt(
      request.prompt,
      request.contestId ?? null,
    );
    const post = await this.generatedPostFactory.createAudioPost(
      request,
      user.id,
      result.videoUrl,
      audioPreset.generatePreviewFromVideo
        ? (result.previewImageUrl ?? null)
        : null,
      resolvedTag,
      {
        width: result.width ?? null,
        height: result.height ?? null,
        hasAudio: result.hasAudio ?? true,
      },
    );
    const [savedPost] = await this.contestFlowService.completeGenerationPosts(
      request.contestSubmissionId,
      [post],
    );

    await this.userActivityService.logMediaGenerationSpent({
      userId: user.id,
      pointsDelta: -totalCost,
      mediaType: 'audio',
      mode: 'audio_generation',
      aiService: request.aiService,
      contestId: request.contestId ?? null,
      postId: savedPost?.id ?? post.id,
      previewUrl:
        savedPost?.previewImageUrl ??
        savedPost?.videoUrl ??
        post.previewImageUrl ??
        post.videoUrl ??
        null,
    });

    return {
      data: [
        {
          id: savedPost?.id ?? post.id,
          imageUrl: savedPost?.imageUrl ?? post.imageUrl,
          videoUrl: savedPost?.videoUrl ?? post.videoUrl,
          previewImageUrl: savedPost?.previewImageUrl ?? post.previewImageUrl,
          generationParams:
            savedPost?.generationParams ?? post.generationParams,
          publishTo,
        },
      ],
      rawOutput: result.rawOutput,
    };
  }

  async finalizeTextVideoGeneration(
    request: TextVideoGenerationRequest,
    userId: number,
  ) {
    const result =
      await this.mediaGenerationExecutionService.generateTextVideos(request);
    return this.finalizeTextVideoResult(request, userId, result);
  }

  async finalizeAcceptedTextVideoGeneration(
    generationTaskId: string,
    request: TextVideoGenerationRequest,
    userId: number,
    result: VideoGenerationResult,
  ) {
    return (await this.reconcileAcceptedTextVideoGeneration(
      generationTaskId,
      request,
      userId,
      result,
    ))!;
  }

  async reconcileAcceptedTextVideoGeneration(
    generationTaskId: string,
    request: TextVideoGenerationRequest,
    userId: number,
    result?: VideoGenerationResult,
  ) {
    const existing =
      await this.generatedPostFactory.findByGenerationTaskId(generationTaskId);
    if (!existing && !result) {
      return null;
    }
    if (existing) {
      assertAdoptedTextVideoPost(existing, request, userId, result);
      result = {
        videoUrl: existing.videoUrl!,
        previewImageUrl: existing.previewImageUrl,
        width: asNullableNumber(existing.generationParams?.width),
        height: asNullableNumber(existing.generationParams?.height),
        hasAudio: existing.hasAudio,
        rawOutput: { adopted: true },
      };
    }
    return this.finalizeTextVideoResult(
      request,
      userId,
      result!,
      generationTaskId,
    );
  }

  async loadFinalizedTextVideoGeneration(
    postId: number,
    contestId?: number | null,
  ) {
    const post = await this.generatedPostFactory.findById(postId);
    if (!post) {
      throw new Error('FINALIZED_TEXT_VIDEO_POST_NOT_FOUND');
    }
    return {
      data: [
        {
          id: post.id,
          imageUrl: post.imageUrl,
          videoUrl: post.videoUrl,
          previewImageUrl: post.previewImageUrl,
          generationParams: post.generationParams,
          publishTo: await this.getContestPublishTo(contestId ?? null),
        },
      ],
      rawOutput: { adopted: true },
    };
  }

  private async finalizeTextVideoResult(
    request: TextVideoGenerationRequest,
    userId: number,
    result: VideoGenerationResult,
    generationTaskId?: string,
  ) {
    const user =
      await this.mediaGenerationGuardsService.getRequiredUser(userId);
    const totalCost = await this.mediaGenerationPricingService.getVideoCost(
      request.aiService,
      request.duration,
    );

    const publishTo = await this.getContestPublishTo(request.contestId ?? null);
    const resolvedTag = await this.mediaTagResolverService.resolveTagForPrompt(
      request.prompt,
      request.contestId ?? null,
    );
    const generationParams = {
      prompt: request.prompt,
      aiService: request.aiService,
      orientation: request.orientation,
      duration: request.duration,
      seed: request.seed ?? null,
      contestId: request.contestId ?? null,
      width: result.width ?? null,
      height: result.height ?? null,
      hasAudio: result.hasAudio ?? false,
    };
    const post = generationTaskId
      ? await this.generatedPostFactory.createVideoPostOnce(
          generationTaskId,
          generationParams,
          user.id,
          result.videoUrl,
          result.previewImageUrl ?? null,
          resolvedTag,
        )
      : await this.generatedPostFactory.createVideoPost(
          generationParams,
          user.id,
          result.videoUrl,
          result.previewImageUrl ?? null,
          resolvedTag,
        );
    const [savedPost] = await this.contestFlowService.completeGenerationPosts(
      request.contestSubmissionId,
      [post],
    );

    const activity = {
      userId: user.id,
      pointsDelta: -totalCost,
      mediaType: 'video',
      mode: 'text_to_video',
      aiService: request.aiService,
      orientation: request.orientation,
      duration: request.duration,
      contestId: request.contestId ?? null,
      postId: savedPost?.id ?? post.id,
      previewUrl:
        savedPost?.previewImageUrl ??
        savedPost?.videoUrl ??
        post.previewImageUrl ??
        post.videoUrl ??
        null,
    } as const;
    if (generationTaskId) {
      await this.userActivityService.logMediaGenerationSpentOnce(
        generationTaskId,
        activity,
      );
    } else {
      await this.userActivityService.logMediaGenerationSpent(activity);
    }

    return {
      data: [
        {
          id: savedPost?.id ?? post.id,
          imageUrl: savedPost?.imageUrl ?? post.imageUrl,
          videoUrl: savedPost?.videoUrl ?? post.videoUrl,
          previewImageUrl: savedPost?.previewImageUrl ?? post.previewImageUrl,
          generationParams:
            savedPost?.generationParams ?? post.generationParams,
          publishTo,
        },
      ],
      rawOutput: result.rawOutput,
    };
  }

  async finalizeImageVideoGeneration(
    request: ImageVideoGenerationRequest,
    userId: number,
  ) {
    const result =
      await this.mediaGenerationExecutionService.generateImageVideos(request);
    const user =
      await this.mediaGenerationGuardsService.getRequiredUser(userId);
    const totalCost = await this.mediaGenerationPricingService.getVideoCost(
      request.aiService,
      request.duration,
    );

    const publishTo = await this.getContestPublishTo(request.contestId ?? null);
    const resolvedTag = await this.mediaTagResolverService.resolveTagForPrompt(
      request.prompt,
      request.contestId ?? null,
    );
    const post = await this.generatedPostFactory.createVideoPost(
      {
        prompt: request.prompt,
        aiService: request.aiService,
        orientation: request.orientation,
        duration: request.duration,
        seed: request.seed ?? null,
        contestId: request.contestId ?? null,
        sourceImageUrl: request.imageUrl,
        width: result.width ?? null,
        height: result.height ?? null,
        hasAudio: result.hasAudio ?? false,
      },
      user.id,
      result.videoUrl,
      result.previewImageUrl ?? request.imageUrl,
      resolvedTag,
    );
    const [savedPost] = await this.contestFlowService.completeGenerationPosts(
      request.contestSubmissionId,
      [post],
    );

    await this.userActivityService.logMediaGenerationSpent({
      userId: user.id,
      pointsDelta: -totalCost,
      mediaType: 'video',
      mode: 'image_to_video',
      aiService: request.aiService,
      orientation: request.orientation,
      duration: request.duration,
      contestId: request.contestId ?? null,
      postId: savedPost?.id ?? post.id,
      previewUrl:
        savedPost?.previewImageUrl ??
        savedPost?.videoUrl ??
        post.previewImageUrl ??
        post.videoUrl ??
        null,
    });

    return {
      data: [
        {
          id: savedPost?.id ?? post.id,
          imageUrl: savedPost?.imageUrl ?? post.imageUrl,
          videoUrl: savedPost?.videoUrl ?? post.videoUrl,
          previewImageUrl: savedPost?.previewImageUrl ?? post.previewImageUrl,
          generationParams:
            savedPost?.generationParams ?? post.generationParams,
          publishTo,
        },
      ],
      rawOutput: result.rawOutput,
    };
  }

  async finalizeMemeGeneration(request: MemeGenerationRequest, userId: number) {
    const meme = await this.mediaGenerationGuardsService.getRequiredMeme(
      request.memeId,
    );
    const [result, user] = await Promise.all([
      this.mediaGenerationExecutionService.generateMemes(request),
      this.mediaGenerationGuardsService.getRequiredUser(userId),
    ]);
    const totalCost = await this.mediaGenerationPricingService.getMemeCost(
      request.aiService,
      meme.referenceVideoDurationSeconds,
    );

    const publishTo = await this.getContestPublishTo(null);
    const post = await this.generatedPostFactory.createMemePost(
      request,
      meme,
      user.id,
      result.videoUrl,
      result.previewImageUrl ?? meme.referenceImageUrl ?? request.imageUrl,
      {
        width: result.width ?? null,
        height: result.height ?? null,
        hasAudio: result.hasAudio ?? true,
      },
    );

    await this.userActivityService.logMediaGenerationSpent({
      userId: user.id,
      pointsDelta: -totalCost,
      mediaType: 'meme',
      mode: 'meme_generation',
      aiService: request.aiService,
      duration: meme.referenceVideoDurationSeconds ?? undefined,
      postId: post.id,
      previewUrl: post.previewImageUrl ?? post.videoUrl ?? null,
    });

    return {
      data: [
        {
          id: post.id,
          imageUrl: post.imageUrl,
          videoUrl: post.videoUrl,
          previewImageUrl: post.previewImageUrl,
          generationParams: post.generationParams,
          publishTo,
        },
      ],
      rawOutput: result.rawOutput,
    };
  }

  private async getContestPublishTo(contestId: number | null) {
    if (!contestId) {
      return {
        postToTwitter: false,
        postToInstagram: false,
      };
    }

    const contest = await this.contestRepository.findOne({
      where: { id: contestId },
      select: ['socialPostSettings'],
    });

    return {
      postToTwitter: contest?.socialPostSettings?.postToTwitter ?? false,
      postToInstagram: contest?.socialPostSettings?.postToInstagram ?? false,
    };
  }
}

function assertAdoptedTextVideoPost(
  post: PostEntity,
  request: TextVideoGenerationRequest,
  userId: number,
  expectedResult?: VideoGenerationResult,
): void {
  const params = post.generationParams as Record<string, unknown> | null;
  const adoptedUserId = Number(post.user?.id);
  const matches =
    typeof post.videoUrl === 'string' &&
    post.videoUrl.length > 0 &&
    (!Number.isSafeInteger(adoptedUserId) || adoptedUserId === userId) &&
    params?.prompt === request.prompt &&
    params?.aiService === request.aiService &&
    params?.orientation === request.orientation &&
    Number(params?.duration) === request.duration &&
    (params?.seed ?? null) === (request.seed ?? null) &&
    (expectedResult === undefined ||
      (post.videoUrl === expectedResult.videoUrl &&
        post.previewImageUrl === (expectedResult.previewImageUrl ?? null)));
  if (!matches) {
    throw new Error('FINALIZED_TEXT_VIDEO_POST_INVARIANT_MISMATCH');
  }
}

function asNullableNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}
