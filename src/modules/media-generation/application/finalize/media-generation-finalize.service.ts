import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ContestFlowService } from 'src/modules/contests/contest-flow.service';
import { ContestEntity } from 'src/modules/contests/entity/contest.entity';
import { NotificationGateway } from 'src/modules/notifications/notification.gateway';
import { UserActivityService } from 'src/modules/engagement/user-activity/services/user-activity.service';
import { UserEntity } from 'src/modules/users/entities/user.entity';
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
import { MediaPreviewService } from 'src/modules/media-generation/infrastructure/previews/media-preview.service';
import { MediaTagResolverService } from 'src/modules/media-generation/infrastructure/tagging/media-tag-resolver.service';

@Injectable()
export class MediaGenerationFinalizeService {
  constructor(
    private readonly contestFlowService: ContestFlowService,
    private readonly generatedPostFactory: GeneratedPostFactory,
    private readonly mediaGenerationExecutionService: MediaGenerationExecutionService,
    private readonly mediaGenerationGuardsService: MediaGenerationGuardsService,
    private readonly mediaGenerationPricingService: MediaGenerationPricingService,
    private readonly mediaPreviewService: MediaPreviewService,
    private readonly mediaTagResolverService: MediaTagResolverService,
    private readonly notificationGateway: NotificationGateway,
    private readonly userActivityService: UserActivityService,
    @InjectRepository(ContestEntity)
    private readonly contestRepository: Repository<ContestEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async finalizePromptImageGeneration(
    request: ResolvedPromptImageGenerationRequest,
    userId: number,
  ) {
    const result =
      await this.mediaGenerationExecutionService.generatePromptImages(request);
    const user = await this.mediaGenerationGuardsService.getRequiredUser(userId);
    const totalCost =
      await this.mediaGenerationPricingService.getPromptImageCost(
        request.aiService,
        request.imageQuantity,
      );

    await this.deductUserPoints(user, totalCost);

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
      previewUrl:
        primaryPost?.imageUrl ?? primaryPost?.previewImageUrl ?? null,
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
    const result = await this.mediaGenerationExecutionService.editImages(request);
    const user = await this.mediaGenerationGuardsService.getRequiredUser(userId);
    const totalCost =
      await this.mediaGenerationPricingService.getImageEditCost(
        request.aiService,
      );

    await this.deductUserPoints(user, totalCost);

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
      previewUrl:
        primaryPost?.imageUrl ?? primaryPost?.previewImageUrl ?? null,
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
    const user = await this.mediaGenerationGuardsService.getRequiredUser(userId);
    const totalCost =
      await this.mediaGenerationPricingService.getAudioCost(request.aiService);

    await this.deductUserPoints(user, totalCost);

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
        ? this.mediaPreviewService.generateCloudinaryVideoPreviewUrl(
            result.videoUrl,
          )
        : null,
      resolvedTag,
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
          generationParams: savedPost?.generationParams ?? post.generationParams,
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
    const user = await this.mediaGenerationGuardsService.getRequiredUser(userId);
    const totalCost = await this.mediaGenerationPricingService.getVideoCost(
      request.aiService,
      request.duration,
    );

    await this.deductUserPoints(user, totalCost);

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
        contestId: request.contestId ?? null,
      },
      user.id,
      result.videoUrl,
      this.mediaPreviewService.generateCloudinaryVideoPreviewUrl(
        result.videoUrl,
      ),
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
    });

    return {
      data: [
        {
          id: savedPost?.id ?? post.id,
          imageUrl: savedPost?.imageUrl ?? post.imageUrl,
          videoUrl: savedPost?.videoUrl ?? post.videoUrl,
          previewImageUrl: savedPost?.previewImageUrl ?? post.previewImageUrl,
          generationParams: savedPost?.generationParams ?? post.generationParams,
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
    const user = await this.mediaGenerationGuardsService.getRequiredUser(userId);
    const totalCost = await this.mediaGenerationPricingService.getVideoCost(
      request.aiService,
      request.duration,
    );

    await this.deductUserPoints(user, totalCost);

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
        contestId: request.contestId ?? null,
        sourceImageUrl: request.imageUrl,
      },
      user.id,
      result.videoUrl,
      request.imageUrl,
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
          generationParams: savedPost?.generationParams ?? post.generationParams,
          publishTo,
        },
      ],
      rawOutput: result.rawOutput,
    };
  }

  async finalizeMemeGeneration(
    request: MemeGenerationRequest,
    userId: number,
  ) {
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

    await this.deductUserPoints(user, totalCost);

    const publishTo = await this.getContestPublishTo(null);
    const post = await this.generatedPostFactory.createMemePost(
      request,
      meme,
      user.id,
      result.videoUrl,
      this.mediaPreviewService.generateCloudinaryVideoPreviewUrl(
        result.videoUrl,
      ) ??
        meme.referenceImageUrl ??
        request.imageUrl,
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

  private async deductUserPoints(user: UserEntity, totalCost: number) {
    user.points -= totalCost;
    await this.userRepository.save(user);
    await this.notificationGateway.emitProfileUpdate(user.id.toString());
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
