import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContestEntity } from 'src/contest/entity/contest.entity';
import { PostEntity } from 'src/post/entities/post.entity';
import { TagEntity } from 'src/tag/entities/tag.entity';
import { GenerateMediaImageDto } from './dto/generate-media-image.dto';
import { MEDIA_IMAGE_POLICY_AI_SERVICE } from './media-image.constants';
import { MediaImageGenerationRequest } from './types/media-image-request.types';

interface CreateMediaImagePostsParams {
  requestId: string;
  providerJobId: string;
  providerModel: string;
  dto: GenerateMediaImageDto;
  request: MediaImageGenerationRequest;
  imageUrls: string[];
  userId: number;
}

interface MediaImageSuggestedTag {
  id: number;
  name: string;
  imageUrl: string;
}

interface MediaImageSocketPayloadItem {
  id: number;
  imageUrl: string;
  videoUrl: null;
  previewImageUrl: null;
  generationParams: Record<string, unknown>;
  publishTo: { postToTwitter: boolean; postToInstagram: boolean };
}

@Injectable()
export class MediaImagePostService {
  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectRepository(TagEntity)
    private readonly tagRepository: Repository<TagEntity>,
  ) {}

  async createGeneratedPosts(
    params: CreateMediaImagePostsParams,
  ): Promise<{
    posts: PostEntity[];
    payloadItems: MediaImageSocketPayloadItem[];
    suggestedTags: MediaImageSuggestedTag[];
  }> {
    const suggestedTags = await this.buildSuggestedTags(
      params.request.context.primaryTag,
    );

    const generationParams = this.buildGenerationParams({
      dto: params.dto,
      request: params.request,
      requestId: params.requestId,
      providerJobId: params.providerJobId,
      providerModel: params.providerModel,
      suggestedTags,
    });

    const publishTo = this.readPublishTo(params.request.context.contest);

    const posts = await Promise.all(
      params.imageUrls.map((imageUrl) =>
        this.postRepository.save(
          this.postRepository.create({
            user: { id: params.userId },
            imageUrl,
            videoUrl: null,
            previewImageUrl: null,
            contest: params.dto.contestId ? { id: params.dto.contestId } : null,
            tag: params.request.context.primaryTag
              ? { id: params.request.context.primaryTag.id }
              : null,
            isPublished: false,
            isSaved: true,
            generationParams,
          }),
        ),
      ),
    );

    return {
      posts,
      payloadItems: posts.map((post) => ({
        id: post.id,
        imageUrl: post.imageUrl,
        videoUrl: null,
        previewImageUrl: null,
        generationParams: post.generationParams || generationParams,
        publishTo,
      })),
      suggestedTags,
    };
  }

  private buildGenerationParams(params: {
    dto: GenerateMediaImageDto;
    request: MediaImageGenerationRequest;
    requestId: string;
    providerJobId: string;
    providerModel: string;
    suggestedTags: MediaImageSuggestedTag[];
  }): Record<string, unknown> {
    return {
      prompt: params.dto.prompt,
      context: params.dto.context ?? null,
      ai_service: MEDIA_IMAGE_POLICY_AI_SERVICE,
      provider: 'runpod',
      provider_model: params.providerModel,
      orientation: params.dto.orientation ?? 'vertical',
      style_id: params.dto.styleId ?? null,
      color_id: params.dto.colorId ?? null,
      contest_id: params.dto.contestId ?? null,
      width: params.request.width,
      height: params.request.height,
      negative_prompt: params.dto.negativePrompt ?? params.request.negativePrompt,
      requestId: params.requestId,
      provider_job_id: params.providerJobId,
      suggestedTags: params.suggestedTags.map((tag) => ({
        id: tag.id,
        name: tag.name,
      })),
    };
  }

  private readPublishTo(contest: ContestEntity | null): {
    postToTwitter: boolean;
    postToInstagram: boolean;
  } {
    const settings = contest?.socialPostSettings;
    return {
      postToTwitter: settings?.postToTwitter ?? false,
      postToInstagram: settings?.postToInstagram ?? false,
    };
  }

  private async buildSuggestedTags(
    primaryTag: TagEntity | null,
  ): Promise<MediaImageSuggestedTag[]> {
    const tags: MediaImageSuggestedTag[] = [];

    if (primaryTag) {
      tags.push({
        id: primaryTag.id,
        name: `#${primaryTag.name}`,
        imageUrl: primaryTag.imageUrl,
      });
    }

    const otherTag = await this.tagRepository.findOne({
      where: { name: 'other' },
    });

    if (otherTag && !tags.some((tag) => tag.id === otherTag.id)) {
      tags.push({
        id: otherTag.id,
        name: `#${otherTag.name}`,
        imageUrl: otherTag.imageUrl,
      });
    }

    return tags;
  }
}
