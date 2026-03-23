import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContestEntity } from 'src/contest/entity/contest.entity';
import { PostEntity } from 'src/post/entities/post.entity';
import { TagEntity } from 'src/tag/entities/tag.entity';
import { GenerateMediaAudioDto } from './dto/generate-media-audio.dto';
import { MediaAudioGenerationRequest } from './types/media-audio-request.types';

interface CreateMediaAudioPostParams {
  requestId: string;
  providerJobId: string;
  providerModel: string;
  dto: GenerateMediaAudioDto;
  request: MediaAudioGenerationRequest;
  uploadedVideoUrl: string;
  userId: number;
}

@Injectable()
export class MediaAudioPostService {
  constructor(
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectRepository(TagEntity)
    private readonly tagRepository: Repository<TagEntity>,
    @InjectRepository(ContestEntity)
    private readonly contestRepository: Repository<ContestEntity>,
  ) {}

  async createGeneratedPost(params: CreateMediaAudioPostParams): Promise<{
    post: PostEntity;
    payloadItem: {
      id: number;
      videoUrl: string;
      previewImageUrl: string | null;
      generationParams: Record<string, unknown>;
      publishTo: { postToTwitter: boolean; postToInstagram: boolean };
    };
    suggestedTags: { id: number; name: string; imageUrl: string }[];
  }> {
    const defaultTag = await this.getDefaultTag();
    const suggestedTags = this.buildSuggestedTags(defaultTag);
    const generationParams = this.buildGenerationParams(params);
    const publishTo = await this.readPublishTo(params.dto.contestId ?? null);

    const post = await this.postRepository.save(
      this.postRepository.create({
        user: { id: params.userId } as any,
        tag: defaultTag ? { id: defaultTag.id } : null,
        ...(params.dto.contestId ? { contest: { id: params.dto.contestId } } : {}),
        videoUrl: params.uploadedVideoUrl,
        imageUrl: null,
        hasAudio: true,
        previewImageUrl: this.generateCloudinaryPreviewUrl(params.uploadedVideoUrl),
        isPublished: false,
        isSaved: true,
        generationParams,
      }),
    );

    return {
      post,
      payloadItem: {
        id: post.id,
        videoUrl: post.videoUrl,
        previewImageUrl: post.previewImageUrl || null,
        generationParams: post.generationParams || generationParams,
        publishTo,
      },
      suggestedTags,
    };
  }

  private buildGenerationParams(params: CreateMediaAudioPostParams): Record<string, unknown> {
    return {
      prompt: params.dto.prompt,
      ai_service: params.dto.aiService,
      provider: 'fal',
      provider_model: params.providerModel,
      duration: params.request.duration,
      contest_id: params.dto.contestId ?? null,
      source_video_url: params.request.videoUrl,
      requestId: params.requestId,
      provider_job_id: params.providerJobId,
    };
  }

  private async getDefaultTag(): Promise<TagEntity | null> {
    const other = await this.tagRepository.findOne({ where: { name: 'other' } });
    if (other) {
      return other;
    }

    const [firstTag] = await this.tagRepository.find({ take: 1 });
    return firstTag || null;
  }

  private buildSuggestedTags(
    tag: TagEntity | null,
  ): { id: number; name: string; imageUrl: string }[] {
    if (!tag) {
      return [];
    }

    return [
      {
        id: tag.id,
        name: `#${tag.name}`,
        imageUrl: tag.imageUrl,
      },
    ];
  }

  private async readPublishTo(
    contestId: number | null,
  ): Promise<{ postToTwitter: boolean; postToInstagram: boolean }> {
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

    const settings = contest?.socialPostSettings;
    return {
      postToTwitter: settings?.postToTwitter ?? false,
      postToInstagram: settings?.postToInstagram ?? false,
    };
  }

  private generateCloudinaryPreviewUrl(videoUrl: string): string | null {
    try {
      if (!videoUrl || typeof videoUrl !== 'string') return null;
      if (!videoUrl.includes('cloudinary.com')) return null;
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
}
