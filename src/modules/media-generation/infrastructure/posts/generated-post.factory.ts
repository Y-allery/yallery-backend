import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ContestEntity } from 'src/modules/contests/entity/contest.entity';
import { MemeEntity } from 'src/modules/memes/entities/meme.entity';
import { PostEntity } from 'src/modules/posts/entities/post.entity';
import { TagEntity } from 'src/modules/catalog/tags/entities/tag.entity';
import { Repository } from 'typeorm';
import { AudioGenerationRequest } from 'src/modules/media-generation/domain/contracts/audio-generation-request.contract';
import { EditImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/edit-image-generation-request.contract';
import { MemeGenerationRequest } from 'src/modules/media-generation/domain/contracts/meme-generation-request.contract';
import { ResolvedPromptImageGenerationRequest } from 'src/modules/media-generation/domain/contracts/prompt-image-generation-request.contract';
import { MediaOrientation } from 'src/modules/media-generation/domain/presets';

@Injectable()
export class GeneratedPostFactory {
  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
  ) {}

  async createPromptImagePost(
    request: ResolvedPromptImageGenerationRequest,
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
        orientation: request.orientation,
        width: request.width,
        height: request.height,
        styleId: request.styleId ?? null,
        colorId: request.colorId ?? null,
        styleName: request.styleName ?? null,
        colorName: request.colorName ?? null,
        loraKey: request.providerSettings?.loraKey ?? null,
        loraScale: request.providerSettings?.loraScale ?? null,
        triggerWord: request.providerSettings?.triggerWord ?? null,
      },
    });

    return await this.postRepository.save(post);
  }

  async createEditedImagePost(
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

  async createAudioPost(
    request: AudioGenerationRequest,
    userId: number,
    videoUrl: string,
    previewImageUrl: string | null,
    tag: TagEntity | null,
    videoMetadata?: {
      width?: number | null;
      height?: number | null;
      hasAudio?: boolean | null;
    },
  ): Promise<PostEntity> {
    const post = this.postRepository.create({
      user: { id: userId },
      imageUrl: null,
      videoUrl,
      hasAudio: videoMetadata?.hasAudio ?? true,
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
        width: videoMetadata?.width ?? null,
        height: videoMetadata?.height ?? null,
      },
    });

    return await this.postRepository.save(post);
  }

  async createVideoPost(
    generationParams: {
      prompt: string;
      aiService: string;
      orientation: MediaOrientation;
      duration: number;
      seed?: number | null;
      contestId?: number | null;
      sourceImageUrl?: string;
      width?: number | null;
      height?: number | null;
      hasAudio?: boolean | null;
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
      hasAudio: generationParams.hasAudio ?? false,
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
        seed: generationParams.seed ?? null,
        sourceImageUrl: generationParams.sourceImageUrl,
        width: generationParams.width ?? null,
        height: generationParams.height ?? null,
      },
    });

    return await this.postRepository.save(post);
  }

  async createMemePost(
    request: MemeGenerationRequest,
    meme: MemeEntity,
    userId: number,
    videoUrl: string,
    previewImageUrl: string | null,
    videoMetadata?: {
      width?: number | null;
      height?: number | null;
      hasAudio?: boolean | null;
    },
  ): Promise<PostEntity> {
    const post = this.postRepository.create({
      user: { id: userId },
      imageUrl: null,
      videoUrl,
      hasAudio: videoMetadata?.hasAudio ?? true,
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
        sourceVideoDurationSeconds: meme.referenceVideoDurationSeconds,
        billableDurationSeconds: meme.referenceVideoDurationSeconds
          ? Math.ceil(meme.referenceVideoDurationSeconds)
          : null,
        width: videoMetadata?.width ?? null,
        height: videoMetadata?.height ?? null,
        memeName: meme.name,
        characterOrientation: request.characterOrientation ?? null,
      },
    });

    return await this.postRepository.save(post);
  }
}
