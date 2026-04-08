import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { ContestEntity } from 'src/contest/entity/contest.entity';
import { MemeEntity } from 'src/meme/entities/meme.entity';
import { PostEntity } from 'src/post/entities/post.entity';
import { StyleEntity } from 'src/post/entities/style.entity';
import { UserEntity } from 'src/user/entities/user.entity';
import { Repository } from 'typeorm';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { AudioAISettingsResponse } from './contracts/audio-ai-settings-response.contract';
import { AudioGenerationRequest } from './contracts/audio-generation-request.contract';
import { AudioGenerationResult } from './contracts/audio-generation-result.contract';
import { EditImageGenerationRequest } from './contracts/edit-image-generation-request.contract';
import { EditImageAISettingsResponse } from './contracts/edit-image-ai-settings-response.contract';
import { ImageVideoGenerationRequest } from './contracts/image-video-generation-request.contract';
import { MemeAISettingsResponse } from './contracts/meme-ai-settings-response.contract';
import { MemeGenerationRequest } from './contracts/meme-generation-request.contract';
import { MemeGenerationResult } from './contracts/meme-generation-result.contract';
import { PromptImageGenerationRequest } from './contracts/prompt-image-generation-request.contract';
import { PromptImageAISettingsResponse } from './contracts/prompt-image-ai-settings-response.contract';
import { PromptImageGenerationResult } from './contracts/prompt-image-generation-result.contract';
import { TextVideoGenerationRequest } from './contracts/text-video-generation-request.contract';
import { VideoAISettingsResponse } from './contracts/video-ai-settings-response.contract';
import { VideoGenerationResult } from './contracts/video-generation-result.contract';
import {
  MEDIA_AUDIO_GENERATION_QUEUE,
  MEDIA_IMAGE_EDIT_GENERATION_QUEUE,
  MEDIA_MEME_GENERATION_QUEUE,
  MEDIA_PROMPT_IMAGE_GENERATION_QUEUE,
} from './constants/media-generation.queue';
import {
  MEDIA_IMAGE_VIDEO_GENERATION_QUEUE,
  MEDIA_TEXT_VIDEO_GENERATION_QUEUE,
} from './constants/media-generation.queue';
import { MediaAISettingsEntity } from './entities/media-ai-settings.entity';
import { MediaProviderRegistryService } from './routing/media-provider-registry.service';
import { MediaRouteResolverService } from './routing/media-route-resolver.service';
import { ContestMediaGenerationResolverService } from './routing/contest-media-generation-resolver.service';
import { MediaTagResolverService } from './services/media-tag-resolver.service';
import { MediaPromptEnhancerService } from './services/media-prompt-enhancer.service';
import { audioGenerateCapability } from './capabilities/audio/audio-generate.capability';
import { imageEditCapability } from './capabilities/image/image-edit.capability';
import { imageGenerateCapability } from './capabilities/image/image-generate.capability';
import { memeGenerateCapability } from './capabilities/meme/meme-generate.capability';
import { videoGenerateCapability } from './capabilities/video/video-generate.capability';
import {
  getAudioGenerationPreset,
  getPromptImageAllowedOrientations,
  getPromptImageDefaultOrientation,
  MediaOrientation,
} from './presets';
import {
  ResolvedPromptImageGenerationRequest,
} from './contracts/prompt-image-generation-request.contract';
import { UserActivityService } from 'src/user-activity/services/user-activity.service';
import { TagEntity } from 'src/tag/entities/tag.entity';
import { ColorEntity } from './entities/color.entity';

@Injectable()
export class MediaGenerationService {
  constructor(
    private readonly mediaRouteResolverService: MediaRouteResolverService,
    private readonly mediaProviderRegistryService: MediaProviderRegistryService,
    private readonly contestMediaGenerationResolverService: ContestMediaGenerationResolverService,
    private readonly mediaTagResolverService: MediaTagResolverService,
    private readonly mediaPromptEnhancerService: MediaPromptEnhancerService,
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
    @InjectRepository(MediaAISettingsEntity)
    private readonly mediaAISettingsRepository: Repository<MediaAISettingsEntity>,
    @InjectRepository(ColorEntity)
    private readonly colorRepository: Repository<ColorEntity>,
    @InjectRepository(StyleEntity)
    private readonly styleRepository: Repository<StyleEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(ContestEntity)
    private readonly contestRepository: Repository<ContestEntity>,
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectRepository(MemeEntity)
    private readonly memeRepository: Repository<MemeEntity>,
    private readonly notificationGateway: NotificationGateway,
    private readonly userActivityService: UserActivityService,
  ) {}

  async getPromptImageAISettings(): Promise<PromptImageAISettingsResponse> {
    const [settings, colors, styles] = await Promise.all([
      this.mediaAISettingsRepository.find({
        where: {
          capability: 'image_generate',
          isActive: true,
        },
        order: {
          id: 'ASC',
        },
      }),
      this.colorRepository.find({
        select: {
          id: true,
          name: true,
        },
        order: {
          id: 'ASC',
        },
      }),
      this.styleRepository.find({
        select: {
          id: true,
          name: true,
          imageUrl: true,
        },
        order: {
          id: 'ASC',
        },
      }),
    ]);

    const visibleSettings = settings.filter(
      (setting) => setting.settings?.contestOnly !== true,
    );

    const defaultSetting =
      visibleSettings.find((setting) => setting.aiService === 'nano_banana') ??
      visibleSettings[0];

    return {
      defaultSettings: {
        defaultAI: defaultSetting?.aiService ?? null,
        defaultOrientations: defaultSetting
          ? getPromptImageDefaultOrientation(defaultSetting.aiService)
          : 'vertical',
      },
      aiSettings: visibleSettings.map((setting) => ({
        aiService: setting.aiService,
        name: setting.name,
        allowedOrientations: getPromptImageAllowedOrientations(setting.aiService),
        cost: setting.cost,
        description: setting.description,
      })),
      colors: colors.map((color) => ({
        id: color.id,
        name: color.name,
      })),
      styles: styles.map((style) => ({
        id: style.id,
        name: style.name,
        imageUrl: style.imageUrl,
      })),
    };
  }

  async getEditImageAISettings(): Promise<EditImageAISettingsResponse> {
    const [settings, colors, styles] = await Promise.all([
      this.mediaAISettingsRepository.find({
        where: {
          capability: 'image_edit',
          isActive: true,
        },
        order: {
          id: 'ASC',
        },
      }),
      this.colorRepository.find({
        select: {
          id: true,
          name: true,
        },
        order: {
          id: 'ASC',
        },
      }),
      this.styleRepository.find({
        select: {
          id: true,
          name: true,
          imageUrl: true,
        },
        order: {
          id: 'ASC',
        },
      }),
    ]);

    const defaultSetting =
      settings.find((setting) => setting.aiService === 'qwen_image_edit') ??
      settings[0];

    return {
      defaultSettings: {
        defaultAI: defaultSetting?.aiService ?? null,
      },
      aiSettings: settings.map((setting) => ({
        aiService: setting.aiService,
        name: setting.name,
        cost: setting.cost,
        description: setting.description,
      })),
      colors: colors.map((color) => ({
        id: color.id,
        name: color.name,
      })),
      styles: styles.map((style) => ({
        id: style.id,
        name: style.name,
        imageUrl: style.imageUrl,
      })),
    };
  }

  async getAudioAISettings(): Promise<AudioAISettingsResponse> {
    const settings = await this.mediaAISettingsRepository.find({
      where: {
        capability: 'audio_generate',
        isActive: true,
      },
      order: {
        id: 'ASC',
      },
    });

    const defaultSetting =
      settings.find((setting) => setting.aiService === 'mmaudio_v2') ??
      settings[0];

    return {
      defaultSettings: {
        defaultAI: defaultSetting?.aiService ?? null,
      },
      aiSettings: settings.map((setting) => ({
        aiService: setting.aiService,
        name: setting.name,
        cost: setting.cost,
        description: setting.description,
      })),
    };
  }

  async getTextVideoAISettings(): Promise<VideoAISettingsResponse> {
    const settings = await this.mediaAISettingsRepository.find({
      where: {
        capability: 'video_generate',
        aiService: 'p_video_text',
        isActive: true,
      },
      order: {
        id: 'ASC',
      },
    });

    const defaultSetting = settings[0];

    return {
      defaultSettings: {
        defaultAI: defaultSetting?.aiService ?? null,
      },
      aiSettings: settings.map((setting) => ({
        aiService: setting.aiService,
        name: setting.name,
        cost: setting.cost,
        description: setting.description,
        settings: setting.settings,
      })),
    };
  }

  async getImageVideoAISettings(): Promise<VideoAISettingsResponse> {
    const settings = await this.mediaAISettingsRepository.find({
      where: {
        capability: 'video_generate',
        aiService: 'p_video_image',
        isActive: true,
      },
      order: {
        id: 'ASC',
      },
    });

    const defaultSetting = settings[0];

    return {
      defaultSettings: {
        defaultAI: defaultSetting?.aiService ?? null,
      },
      aiSettings: settings.map((setting) => ({
        aiService: setting.aiService,
        name: setting.name,
        cost: setting.cost,
        description: setting.description,
        settings: setting.settings,
      })),
    };
  }

  async getMemeAISettings(): Promise<MemeAISettingsResponse> {
    const settings = await this.mediaAISettingsRepository.find({
      where: {
        capability: 'meme_generate',
        isActive: true,
      },
      order: {
        id: 'ASC',
      },
    });

    const defaultSetting =
      settings.find(
        (setting) => setting.aiService === 'kling_v26_std_motion_control',
      ) ?? settings[0];

    return {
      defaultSettings: {
        defaultAI: defaultSetting?.aiService ?? null,
      },
      aiSettings: settings.map((setting) => ({
        aiService: setting.aiService,
        name: setting.name,
        cost: setting.cost,
        description: setting.description,
        settings: setting.settings
          ? {
              characterOrientations: setting.settings.characterOrientations,
              defaultCharacterOrientation:
                setting.settings.defaultCharacterOrientation,
              keepOriginalSound: setting.settings.keepOriginalSound,
            }
          : null,
      })),
    };
  }

  async resolveVideoDuration(
    aiService: string,
    requestedDuration?: number,
  ): Promise<number> {
    const setting = await this.mediaAISettingsRepository.findOne({
      where: {
        aiService,
        capability: 'video_generate',
        isActive: true,
      },
    });

    if (!setting) {
      throw new NotFoundException(`Video model ${aiService} not found`);
    }

    const supportedDurations = setting.settings?.durations?.filter((value) =>
      Number.isFinite(value),
    );

    if (!supportedDurations?.length) {
      return requestedDuration ?? 5;
    }

    if (requestedDuration == null) {
      return supportedDurations[0];
    }

    if (!supportedDurations.includes(requestedDuration)) {
      throw new BadRequestException(
        `Unsupported duration for ${aiService}. Supported values: ${supportedDurations.join(', ')}`,
      );
    }

    return requestedDuration;
  }

  async generatePromptImages(
    request: ResolvedPromptImageGenerationRequest,
  ): Promise<PromptImageGenerationResult> {
    const route = this.mediaRouteResolverService.resolvePromptImageRoute(
      request.aiService,
    );

    if (!route) {
      throw new NotImplementedException(
        `No media-generation route configured for ${request.aiService}`,
      );
    }

    const provider = this.mediaProviderRegistryService.getProvider(route.provider);

    if (!provider.generatePromptImages) {
      throw new NotImplementedException(
        `Provider ${route.provider} does not support prompt image generation`,
      );
    }

    return await provider.generatePromptImages(request);
  }

  async editImages(
    request: EditImageGenerationRequest,
  ): Promise<PromptImageGenerationResult> {
    const route = this.mediaRouteResolverService.resolveImageEditRoute(
      request.aiService,
    );

    if (!route) {
      throw new NotImplementedException(
        `No media-generation route configured for image edit service ${request.aiService}`,
      );
    }

    const provider = this.mediaProviderRegistryService.getProvider(route.provider);

    if (!provider.editImages) {
      throw new NotImplementedException(
        `Provider ${route.provider} does not support image editing`,
      );
    }

    return await provider.editImages(request);
  }

  async generateAudio(
    request: AudioGenerationRequest,
  ): Promise<AudioGenerationResult> {
    const route = this.mediaRouteResolverService.resolveAudioRoute(
      request.aiService,
    );

    if (!route) {
      throw new NotImplementedException(
        `No media-generation route configured for audio service ${request.aiService}`,
      );
    }

    const provider = this.mediaProviderRegistryService.getProvider(route.provider);

    if (!provider.generateAudio) {
      throw new NotImplementedException(
        `Provider ${route.provider} does not support audio generation`,
      );
    }

    return await provider.generateAudio(request);
  }

  async generateTextVideos(
    request: TextVideoGenerationRequest,
  ): Promise<VideoGenerationResult> {
    const route = this.mediaRouteResolverService.resolveTextVideoRoute(
      request.aiService,
    );

    if (!route) {
      throw new NotImplementedException(
        `No media-generation route configured for text video service ${request.aiService}`,
      );
    }

    const provider = this.mediaProviderRegistryService.getProvider(route.provider);

    if (!provider.generateTextVideos) {
      throw new NotImplementedException(
        `Provider ${route.provider} does not support text-to-video generation`,
      );
    }

    return await provider.generateTextVideos(request);
  }

  async generateImageVideos(
    request: ImageVideoGenerationRequest,
  ): Promise<VideoGenerationResult> {
    const route = this.mediaRouteResolverService.resolveImageVideoRoute(
      request.aiService,
    );

    if (!route) {
      throw new NotImplementedException(
        `No media-generation route configured for image video service ${request.aiService}`,
      );
    }

    const provider = this.mediaProviderRegistryService.getProvider(route.provider);

    if (!provider.generateImageVideos) {
      throw new NotImplementedException(
        `Provider ${route.provider} does not support image-to-video generation`,
      );
    }

    return await provider.generateImageVideos(request);
  }

  async generateMemes(
    request: MemeGenerationRequest,
  ): Promise<MemeGenerationResult> {
    const route = this.mediaRouteResolverService.resolveMemeRoute(
      request.aiService,
    );

    if (!route) {
      throw new NotImplementedException(
        `No media-generation route configured for meme service ${request.aiService}`,
      );
    }

    const provider = this.mediaProviderRegistryService.getProvider(route.provider);

    if (!provider.generateMemes) {
      throw new NotImplementedException(
        `Provider ${route.provider} does not support meme generation`,
      );
    }

    return await provider.generateMemes(request);
  }

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
    await this.assertUserCanGeneratePromptImages(resolvedRequest, userId);

    return await this.mediaPromptImageQueue.add(
      resolvedRequest.aiService,
      {
        request: resolvedRequest,
        userId,
        aiService: resolvedRequest.aiService,
      },
      {
        attempts: 2,
        backoff: 30000,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
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
    await this.assertUserCanEditImages(enhancedRequest, userId);

    return await this.mediaImageEditQueue.add(
      enhancedRequest.aiService,
      {
        request: enhancedRequest,
        userId,
        aiService: enhancedRequest.aiService,
      },
      {
        attempts: 2,
        backoff: 30000,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  async enqueueAudioGeneration(
    request: AudioGenerationRequest,
    userId: number,
  ) {
    await this.assertUserCanGenerateAudio(request, userId);

    return await this.mediaAudioQueue.add(
      request.aiService,
      {
        request,
        userId,
        aiService: request.aiService,
      },
      {
        attempts: 2,
        backoff: 30000,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  async enqueueTextVideoGeneration(
    request: TextVideoGenerationRequest,
    userId: number,
  ) {
    await this.assertUserCanGenerateVideos(request, userId);

    return await this.mediaTextVideoQueue.add(
      request.aiService,
      {
        request,
        userId,
        aiService: request.aiService,
      },
      {
        attempts: 2,
        backoff: 30000,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  async enqueueImageVideoGeneration(
    request: ImageVideoGenerationRequest,
    userId: number,
  ) {
    await this.assertUserCanGenerateVideos(request, userId);

    return await this.mediaImageVideoQueue.add(
      request.aiService,
      {
        request,
        userId,
        aiService: request.aiService,
      },
      {
        attempts: 2,
        backoff: 30000,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  async enqueueMemeGeneration(
    request: Omit<MemeGenerationRequest, 'videoUrl'>,
    userId: number,
  ) {
    const meme = await this.getRequiredMeme(request.memeId);
    const enrichedRequest: MemeGenerationRequest = {
      ...request,
      videoUrl: meme.referenceVideoUrl,
    };

    await this.assertUserCanGenerateMemes(enrichedRequest, userId);

    return await this.mediaMemeQueue.add(
      enrichedRequest.aiService,
      {
        request: enrichedRequest,
        userId,
        aiService: enrichedRequest.aiService,
      },
      {
        attempts: 2,
        backoff: 30000,
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  async finalizePromptImageGeneration(
    request: ResolvedPromptImageGenerationRequest,
    userId: number,
  ) {
    const result = await this.generatePromptImages(request);
    const user = await this.getRequiredUser(userId);
    const totalCost = await this.getPromptImageCost(
      request.aiService,
      request.imageQuantity,
    );

    user.points -= totalCost;
    await this.userRepository.save(user);
    await this.notificationGateway.emitProfileUpdate(user.id.toString());

    const publishTo = await this.getContestPublishTo(request.contestId ?? null);
    const resolvedTag = await this.mediaTagResolverService.resolveTagForPrompt(
      request.translatedPrompt ?? request.prompt,
      request.contestId ?? null,
    );
    const posts = await Promise.all(
      result.imageUrls.map(async (imageUrl) => {
        return await this.createGeneratedPromptImagePost(
          request,
          user.id,
          imageUrl,
          resolvedTag,
        );
      }),
    );

    const primaryPost = posts[0] ?? null;
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
      data: posts.map((post) => ({
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
    const result = await this.editImages(request);
    const user = await this.getRequiredUser(userId);
    const totalCost = await this.getImageEditCost(request.aiService);

    user.points -= totalCost;
    await this.userRepository.save(user);
    await this.notificationGateway.emitProfileUpdate(user.id.toString());

    const publishTo = await this.getContestPublishTo(request.contestId ?? null);
    const resolvedTag = await this.mediaTagResolverService.resolveTagForPrompt(
      request.translatedPrompt ?? request.prompt,
      request.contestId ?? null,
    );
    const posts = await Promise.all(
      result.imageUrls.map(async (imageUrl) => {
        return await this.createGeneratedEditedImagePost(
          request,
          user.id,
          imageUrl,
          resolvedTag,
        );
      }),
    );

    const primaryPost = posts[0] ?? null;
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
      data: posts.map((post) => ({
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
    const result = await this.generateAudio(request);
    const user = await this.getRequiredUser(userId);
    const totalCost = await this.getAudioCost(request.aiService);

    user.points -= totalCost;
    await this.userRepository.save(user);
    await this.notificationGateway.emitProfileUpdate(user.id.toString());

    const publishTo = await this.getContestPublishTo(request.contestId ?? null);
    const audioPreset = getAudioGenerationPreset(request.aiService);
    const resolvedTag = await this.mediaTagResolverService.resolveTagForPrompt(
      request.prompt,
      request.contestId ?? null,
    );
    const post = await this.createGeneratedAudioPost(
      request,
      user.id,
      result.videoUrl,
      audioPreset.generatePreviewFromVideo
        ? this.generateCloudinaryVideoPreviewUrl(result.videoUrl)
        : null,
      resolvedTag,
    );

    await this.userActivityService.logMediaGenerationSpent({
      userId: user.id,
      pointsDelta: -totalCost,
      mediaType: 'audio',
      mode: 'audio_generation',
      aiService: request.aiService,
      contestId: request.contestId ?? null,
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

  async finalizeTextVideoGeneration(
    request: TextVideoGenerationRequest,
    userId: number,
  ) {
    const result = await this.generateTextVideos(request);
    const user = await this.getRequiredUser(userId);
    const totalCost = await this.getVideoCost(request.aiService);

    user.points -= totalCost;
    await this.userRepository.save(user);
    await this.notificationGateway.emitProfileUpdate(user.id.toString());

    const publishTo = await this.getContestPublishTo(request.contestId ?? null);
    const resolvedTag = await this.mediaTagResolverService.resolveTagForPrompt(
      request.prompt,
      request.contestId ?? null,
    );
    const post = await this.createGeneratedVideoPost(
      {
        prompt: request.prompt,
        aiService: request.aiService,
        orientation: request.orientation,
        duration: request.duration,
        contestId: request.contestId ?? null,
      },
      user.id,
      result.videoUrl,
      this.generateCloudinaryVideoPreviewUrl(result.videoUrl),
      resolvedTag,
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

  async finalizeImageVideoGeneration(
    request: ImageVideoGenerationRequest,
    userId: number,
  ) {
    const result = await this.generateImageVideos(request);
    const user = await this.getRequiredUser(userId);
    const totalCost = await this.getVideoCost(request.aiService);

    user.points -= totalCost;
    await this.userRepository.save(user);
    await this.notificationGateway.emitProfileUpdate(user.id.toString());

    const publishTo = await this.getContestPublishTo(request.contestId ?? null);
    const resolvedTag = await this.mediaTagResolverService.resolveTagForPrompt(
      request.prompt,
      request.contestId ?? null,
    );
    const post = await this.createGeneratedVideoPost(
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

    await this.userActivityService.logMediaGenerationSpent({
      userId: user.id,
      pointsDelta: -totalCost,
      mediaType: 'video',
      mode: 'image_to_video',
      aiService: request.aiService,
      orientation: request.orientation,
      duration: request.duration,
      contestId: request.contestId ?? null,
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

  async finalizeMemeGeneration(
    request: MemeGenerationRequest,
    userId: number,
  ) {
    const meme = await this.getRequiredMeme(request.memeId);
    const [result, user] = await Promise.all([
      this.generateMemes(request),
      this.getRequiredUser(userId),
    ]);
    const totalCost = await this.getMemeCost(request.aiService);

    user.points -= totalCost;
    await this.userRepository.save(user);
    await this.notificationGateway.emitProfileUpdate(user.id.toString());

    const publishTo = await this.getContestPublishTo(null);
    const post = await this.createGeneratedMemePost(
      request,
      meme,
      user.id,
      result.videoUrl,
      this.generateCloudinaryVideoPreviewUrl(result.videoUrl) ??
        meme.referenceImageUrl ??
        request.imageUrl,
    );

    await this.userActivityService.logMediaGenerationSpent({
      userId: user.id,
      pointsDelta: -totalCost,
      mediaType: 'meme',
      mode: 'meme_generation',
      aiService: request.aiService,
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

  private async assertUserCanGeneratePromptImages(
    request: ResolvedPromptImageGenerationRequest,
    userId: number,
  ) {
    if (request.contestId) {
      await this.contestMediaGenerationResolverService.assertContestCapability(
        request.contestId,
        'image_generate',
      );
    }

    const user = await this.getRequiredUser(userId);
    const totalCost = await this.getPromptImageCost(
      request.aiService,
      request.imageQuantity,
    );

    if (user.points < totalCost) {
      throw new BadRequestException('Not enough credits to generate images');
    }

  }

  private async assertUserCanEditImages(
    request: EditImageGenerationRequest,
    userId: number,
  ) {
    if (request.contestId) {
      await this.contestMediaGenerationResolverService.assertContestCapability(
        request.contestId,
        'image_generate',
      );
    }

    const user = await this.getRequiredUser(userId);
    const totalCost = await this.getImageEditCost(request.aiService);

    if (user.points < totalCost) {
      throw new BadRequestException('Not enough credits to edit images');
    }
  }

  private async assertUserCanGenerateAudio(
    request: AudioGenerationRequest,
    userId: number,
  ) {
    if (request.contestId) {
      await this.contestMediaGenerationResolverService.assertContestCapability(
        request.contestId,
        'audio_generate',
      );
    }

    const user = await this.getRequiredUser(userId);
    const totalCost = await this.getAudioCost(request.aiService);

    if (user.points < totalCost) {
      throw new BadRequestException('Not enough credits to generate audio');
    }
  }

  private async assertUserCanGenerateVideos(
    request:
      | TextVideoGenerationRequest
      | ImageVideoGenerationRequest,
    userId: number,
  ) {
    if (request.contestId) {
      await this.contestMediaGenerationResolverService.assertContestCapability(
        request.contestId,
        'video_generate',
      );
    }

    const user = await this.getRequiredUser(userId);
    const totalCost = await this.getVideoCost(request.aiService);

    if (user.points < totalCost) {
      throw new BadRequestException('Not enough credits to generate videos');
    }
  }

  private async assertUserCanGenerateMemes(
    request: MemeGenerationRequest,
    userId: number,
  ) {
    await this.getRequiredMeme(request.memeId);

    const user = await this.getRequiredUser(userId);
    const totalCost = await this.getMemeCost(request.aiService);

    if (user.points < totalCost) {
      throw new BadRequestException('Not enough credits to generate memes');
    }
  }

  private async getRequiredUser(userId: number): Promise<UserEntity> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { tags: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private async getRequiredMeme(memeId: number): Promise<MemeEntity> {
    const meme = await this.memeRepository.findOne({
      where: { id: memeId },
      relations: ['tag'],
    });

    if (!meme) {
      throw new NotFoundException(`Meme with id ${memeId} not found`);
    }

    if (!meme.isActive) {
      throw new BadRequestException('This meme template is not active');
    }

    if (!meme.referenceVideoUrl) {
      throw new BadRequestException(
        'Meme template has no reference video configured',
      );
    }

    if (!meme.tag) {
      throw new BadRequestException('Meme template has no tag assigned');
    }

    return meme;
  }

  private async getPromptImageCost(
    aiService: string,
    imageQuantity: number,
  ): Promise<number> {
    const aiSetting = await this.mediaAISettingsRepository.findOne({
      where: {
        aiService,
        capability: 'image_generate',
        isActive: true,
      },
    });

    if (!aiSetting) {
      throw new BadRequestException(
        `Media AI settings not found for prompt image service ${aiService}`,
      );
    }

    return aiSetting.cost * imageQuantity;
  }

  private async getImageEditCost(aiService: string): Promise<number> {
    const aiSetting = await this.mediaAISettingsRepository.findOne({
      where: {
        aiService,
        capability: 'image_edit',
        isActive: true,
      },
    });

    if (!aiSetting) {
      throw new BadRequestException(
        `Media AI settings not found for image edit service ${aiService}`,
      );
    }

    return aiSetting.cost;
  }

  private async getAudioCost(aiService: string): Promise<number> {
    const aiSetting = await this.mediaAISettingsRepository.findOne({
      where: {
        aiService,
        capability: 'audio_generate',
        isActive: true,
      },
    });

    if (!aiSetting) {
      throw new BadRequestException(
        `Media AI settings not found for audio service ${aiService}`,
      );
    }

    return aiSetting.cost;
  }

  private async getVideoCost(aiService: string): Promise<number> {
    const aiSetting = await this.mediaAISettingsRepository.findOne({
      where: {
        aiService,
        capability: 'video_generate',
        isActive: true,
      },
    });

    if (!aiSetting) {
      throw new BadRequestException(
        `Media AI settings not found for video service ${aiService}`,
      );
    }

    return aiSetting.cost;
  }

  private async getMemeCost(aiService: string): Promise<number> {
    const aiSetting = await this.mediaAISettingsRepository.findOne({
      where: {
        aiService,
        capability: 'meme_generate',
        isActive: true,
      },
    });

    if (!aiSetting) {
      throw new BadRequestException(
        `Media AI settings not found for meme service ${aiService}`,
      );
    }

    return aiSetting.cost;
  }

  private async createGeneratedPromptImagePost(
    request: ResolvedPromptImageGenerationRequest,
    userId: number,
    imageUrl: string,
    tag: TagEntity | null,
  ): Promise<PostEntity> {
    const post = this.postRepository.create({
      user: { id: userId },
      imageUrl,
      tag,
      contest: request.contestId ? ({ id: request.contestId } as ContestEntity) : null,
      isPublished: false,
      isSaved: true,
      generationParams: {
        prompt: request.prompt,
        translatedPrompt: request.translatedPrompt,
        resolvedPrompt: request.resolvedPrompt ?? request.prompt,
        aiService: request.aiService,
        orientation: request.orientation,
        width: request.width,
        height: request.height,
        styleId: request.styleId ?? null,
        colorId: request.colorId ?? null,
        styleName: request.styleName ?? null,
        colorName: request.colorName ?? null,
      },
    });

    return await this.postRepository.save(post);
  }

  private async createGeneratedEditedImagePost(
    request: EditImageGenerationRequest,
    userId: number,
    imageUrl: string,
    tag: TagEntity | null,
  ): Promise<PostEntity> {
    const post = this.postRepository.create({
      user: { id: userId },
      imageUrl,
      tag,
      contest: request.contestId
        ? ({ id: request.contestId } as ContestEntity)
        : null,
      isPublished: false,
      isSaved: true,
      generationParams: {
        prompt: request.prompt,
        translatedPrompt: request.translatedPrompt,
        resolvedPrompt: request.resolvedPrompt ?? request.prompt,
        aiService: request.aiService,
        sourceImageUrl: request.imageUrl,
        styleId: request.styleId ?? null,
        colorId: request.colorId ?? null,
        styleName: request.styleName ?? null,
        colorName: request.colorName ?? null,
      },
    });

    return await this.postRepository.save(post);
  }

  private async createGeneratedAudioPost(
    request: AudioGenerationRequest,
    userId: number,
    videoUrl: string,
    previewImageUrl: string | null,
    tag: TagEntity | null,
  ): Promise<PostEntity> {
    const post = this.postRepository.create({
      user: { id: userId },
      imageUrl: null,
      videoUrl,
      hasAudio: true,
      previewImageUrl,
      tag,
      contest: request.contestId
        ? ({ id: request.contestId } as ContestEntity)
        : null,
      isPublished: false,
      isSaved: true,
      generationParams: {
        prompt: request.prompt,
        aiService: request.aiService,
        sourceVideoUrl: request.videoUrl,
      },
    });

    return await this.postRepository.save(post);
  }

  private async createGeneratedVideoPost(
    generationParams: {
      prompt: string;
      aiService: string;
      orientation: MediaOrientation;
      duration: number;
      contestId?: number | null;
      sourceImageUrl?: string;
    },
    userId: number,
    videoUrl: string,
    previewImageUrl: string | null,
    tag: TagEntity | null,
  ): Promise<PostEntity> {
    const post = this.postRepository.create({
      user: { id: userId },
      imageUrl: null,
      videoUrl,
      hasAudio: false,
      previewImageUrl,
      tag,
      contest: generationParams.contestId
        ? ({ id: generationParams.contestId } as ContestEntity)
        : null,
      isPublished: false,
      isSaved: true,
      generationParams: {
        prompt: generationParams.prompt,
        aiService: generationParams.aiService,
        orientation: generationParams.orientation,
        duration: generationParams.duration,
        sourceImageUrl: generationParams.sourceImageUrl,
      },
    });

    return await this.postRepository.save(post);
  }

  private async createGeneratedMemePost(
    request: MemeGenerationRequest,
    meme: MemeEntity,
    userId: number,
    videoUrl: string,
    previewImageUrl: string | null,
  ): Promise<PostEntity> {
    const suggestedTags = meme.tag
      ? [
          {
            id: meme.tag.id,
            name: `#${meme.tag.name}`,
            imageUrl: meme.tag.imageUrl,
          },
        ]
      : [];

    const post = this.postRepository.create({
      user: { id: userId },
      imageUrl: null,
      videoUrl,
      hasAudio: true,
      previewImageUrl,
      tag: meme.tag,
      isPublished: false,
      isSaved: true,
      generationParams: {
        prompt:
          request.prompt?.trim() ||
          'Make the character in the image follow the movements of the character in the video.',
        aiService: request.aiService,
        negativePrompt: request.negativePrompt ?? '',
        memeId: meme.id,
        sourceImageUrl: request.imageUrl,
        sourceVideoUrl: meme.referenceVideoUrl,
        memeName: meme.name,
        characterOrientation: request.characterOrientation ?? null,
        suggestedTags,
      },
    });

    return await this.postRepository.save(post);
  }

  private generateCloudinaryVideoPreviewUrl(videoUrl: string): string | null {
    try {
      if (!videoUrl || typeof videoUrl !== 'string') {
        return null;
      }

      const base = videoUrl.split('?')[0];

      if (base.includes('/video/upload/')) {
        const withFrame = base.replace('/video/upload/', '/video/upload/so_0/');
        if (/\.(mp4|webm|mov|avi)$/i.test(withFrame)) {
          return withFrame.replace(/\.(mp4|webm|mov|avi)$/i, '.jpg');
        }

        return `${withFrame}.jpg`;
      }

      if (/\.(mp4|webm|mov|avi)$/i.test(base)) {
        return base.replace(/\.(mp4|webm|mov|avi)$/i, '.jpg');
      }

      return `${base}.jpg`;
    } catch {
      return null;
    }
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

  getCapabilities() {
    return {
      capabilities: [
        imageGenerateCapability,
        imageEditCapability,
        audioGenerateCapability,
        videoGenerateCapability,
        memeGenerateCapability,
      ],
      routes: this.mediaRouteResolverService.describeRoutes(),
    };
  }
}
