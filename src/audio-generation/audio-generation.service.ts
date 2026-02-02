import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fal from '@fal-ai/serverless-client';
import OpenAI from 'openai';
import { v2 as cloudinary } from 'cloudinary';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

import { AudioAIEnum, ModelInputEnum } from 'src/common/enums/ai.enum';
import { AISettingsEntity } from 'src/image-generation/entities/ai-settings.entity';
import { ServiceTokenService } from 'src/service-token/service-token.service';
import { UploadService } from 'src/upload/upload.service';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { ActivityService } from 'src/activity/activity.service';
import { ActivityEnum } from 'src/activity/types/activity.enum';

import { UserEntity } from 'src/user/entities/user.entity';
import { PostEntity } from 'src/post/entities/post.entity';
import { TagEntity } from 'src/tag/entities/tag.entity';
import { GenerateAudioDto } from './dto/generate-audio.dto';

@Injectable()
export class AudioGenerationService {
  private openai: OpenAI;

  constructor(
    @InjectQueue(AudioAIEnum.MIRELO_SFX_VIDEO_TO_VIDEO)
    private readonly mireloQueue: Queue,
    private readonly serviceTokenService: ServiceTokenService,
    private readonly uploadService: UploadService,
    private readonly activityService: ActivityService,
    private readonly notificationGateway: NotificationGateway,
    private readonly configService: ConfigService,
    @InjectRepository(UserEntity)
    private userEntity: Repository<UserEntity>,
    @InjectRepository(PostEntity)
    private postRepository: Repository<PostEntity>,
    @InjectRepository(TagEntity)
    private tagRepository: Repository<TagEntity>,
    @InjectRepository(AISettingsEntity)
    private aiSettingsRepository: Repository<AISettingsEntity>,
  ) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    cloudinary.config({
      cloud_name: this.configService.get('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get('CLOUDINARY_API_SECRET'),
    });
  }

  async addAudioTaskToQueue(dto: GenerateAudioDto, userId: number) {
    const user = await this.userEntity.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    await this.verifyUserHasEnoughCredits(user, dto.ai_service);

    const jobOptions = {
      attempts: 3,
      backoff: 15000,
      removeOnComplete: true,
      removeOnFail: false,
    };

    return await this.mireloQueue.add(
      dto.ai_service,
      { dto, userId, aiService: dto.ai_service },
      jobOptions,
    );
  }

  private async verifyUserHasEnoughCredits(user: UserEntity, aiService: AudioAIEnum) {
    const cost = await this.getCostByService(aiService);
    if (user.points < cost) {
      throw new BadRequestException('Not enough credits to generate audio');
    }
  }

  async getCostByService(service: AudioAIEnum): Promise<number> {
    const aiSetting = await this.aiSettingsRepository.findOne({
      where: { aiService: service, isActive: true, type: 'video' },
    });
    if (!aiSetting) {
      throw new BadRequestException(
        `AI service ${service} not found in ai_settings or is inactive`,
      );
    }
    return aiSetting.cost;
  }

  async getAllAISettings() {
    const settings = await this.aiSettingsRepository.find({
      where: {
        type: 'video',
        isActive: true,
        aiService: AudioAIEnum.MIRELO_SFX_VIDEO_TO_VIDEO,
      },
      order: { id: 'ASC' },
    });

    if (settings.length === 0) {
      return {
        defaultSettings: { defaultAI: AudioAIEnum.MIRELO_SFX_VIDEO_TO_VIDEO, cost: 0 },
        aiSettings: [],
      };
    }

    return {
      defaultSettings: {
        defaultAI: AudioAIEnum.MIRELO_SFX_VIDEO_TO_VIDEO,
        cost: settings[0].cost,
      },
      aiSettings: settings.map((s) => ({
        id: s.aiService,
        name: s.name,
        cost: s.cost,
        description: s.description,
        api_model: s.apiModel,
        supportedInputs: [ModelInputEnum.TEXT_PROMPT, ModelInputEnum.VIDEO_SOURCE],
      })),
    };
  }

  async generateAudio(dto: GenerateAudioDto): Promise<{ uploadedVideoUrl: string }> {
    const token = await this.serviceTokenService.getNextAvailableToken(dto.ai_service);
    fal.config({ credentials: token.token });

    const aiSetting = await this.aiSettingsRepository.findOne({
      where: { aiService: dto.ai_service, type: 'video', isActive: true },
    });
    if (!aiSetting?.apiModel) {
      throw new BadRequestException('Invalid AI service selected or apiModel not found');
    }

    // Preflight check: ensure the video URL is publicly reachable (common cause of 422)
    try {
      const head = await axios.head(dto.video_url, {
        timeout: 8000,
        validateStatus: () => true,
      });
      if (head.status < 200 || head.status >= 400) {
        throw new BadRequestException(
          `video_url is not reachable (status ${head.status}). Make sure it's a public direct video URL.`,
        );
      }
    } catch (e: any) {
      const msg = e?.message || e?.toString?.() || 'unknown';
      throw new BadRequestException(
        `video_url preflight failed: ${msg}. Make sure it's a public direct video URL.`,
      );
    }

    const input: any = {
      video_url: dto.video_url,
      text_prompt: dto.sound_prompt ?? dto.text_prompt ?? '',
      // docs default: 2
      num_samples: 2,
    };

    let result: any;
    try {
      result = await (fal.run as any)(aiSetting.apiModel, { input });
    } catch (error: any) {
      // fal errors often include useful JSON details for 422; log everything we can
      const details =
        error?.body ??
        error?.response?.data ??
        error?.data ??
        error?.message ??
        error;
      console.error(
        '[AudioGenerationService.generateAudio] fal.run failed',
        JSON.stringify(
          {
            aiService: dto.ai_service,
            apiModel: aiSetting.apiModel,
            input,
            error: details,
          },
          null,
          2,
        ),
      );
      throw error;
    }
    const rawVideoUrl = (result as any)?.video?.[0]?.url ?? (result as any)?.video?.url;
    if (!rawVideoUrl) {
      throw new Error(`Audio model returned no video. Result: ${JSON.stringify(result)}`);
    }

    const uploadedVideoUrl = await this.uploadService.uploadVideoByUrl(rawVideoUrl);
    if (!uploadedVideoUrl) {
      throw new Error('Failed to upload video: upload service returned no URL');
    }
    return { uploadedVideoUrl };
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

  async getVideoDimensionsSafe(
    videoUrl: string,
  ): Promise<{ width: number; height: number } | null> {
    try {
      if (!videoUrl.includes('cloudinary.com')) return null;

      const urlParts = videoUrl.split('/');
      const uploadIndex = urlParts.indexOf('upload');
      if (uploadIndex === -1 || uploadIndex + 1 >= urlParts.length) return null;

      const segmentsAfterUpload = urlParts.slice(uploadIndex + 1);
      const segmentsWithoutVersion = segmentsAfterUpload.filter(
        (segment, index) => !(index === 0 && /^v\d+$/.test(segment)),
      );
      const publicIdWithExtension = segmentsWithoutVersion.join('/');
      const publicId = publicIdWithExtension.replace(/\.[^/.]+$/, '');
      if (!publicId) return null;

      const result = await cloudinary.api.resource(publicId, { resource_type: 'video' });
      if (result?.width && result?.height) {
        return { width: Number(result.width), height: Number(result.height) };
      }
      return null;
    } catch {
      return null;
    }
  }

  async resolveTag(prompt: string): Promise<TagEntity> {
    if (!prompt?.trim()) return this.getDefaultTag();
    try {
      const tags = await this.tagRepository.find();
      const tagNames = tags.map((t) => t.name);
      const messages: any = [
        {
          role: 'user' as const,
          content: `Given the following prompt: \"${prompt}\" and the following list of tags: [${tagNames.join(
            ', ',
          )}], please return only the most relevant tag name.`,
        },
      ];
      const response = await this.openai.chat.completions.create({
        model: 'o4-mini-2025-04-16',
        messages,
        max_completion_tokens: 200,
      });
      const tagName = response.choices?.[0]?.message?.content?.trim();
      return tags.find((t) => t.name.toLowerCase() === tagName?.toLowerCase()) ?? tags[0];
    } catch {
      return this.getDefaultTag();
    }
  }

  async getDefaultTag(): Promise<TagEntity> {
    const tags = await this.tagRepository.find();
    return tags[0];
  }

  async buildSuggestedTags(
    tag: TagEntity,
  ): Promise<{ id: number; name: string; imageUrl: string }[]> {
    const suggestedTags: { id: number; name: string; imageUrl: string }[] = [];
    if (tag) {
      suggestedTags.push({ id: tag.id, name: '#' + tag.name, imageUrl: tag.imageUrl });
    }
    const otherTag = await this.tagRepository.findOne({ where: { name: 'other' } });
    if (otherTag && (!tag || otherTag.id !== tag.id)) {
      suggestedTags.push({
        id: otherTag.id,
        name: '#' + otherTag.name,
        imageUrl: otherTag.imageUrl,
      });
    }
    return suggestedTags;
  }

  async createPostForAudioVideo(
    videoUrl: string,
    user: UserEntity,
    tag: TagEntity,
    prompt: string,
    suggestedTags?: { id: number; name: string }[],
    width?: number,
    height?: number,
  ): Promise<PostEntity> {
    const previewImageUrl = this.generateCloudinaryPreviewUrl(videoUrl);
    const post = this.postRepository.create({
      user: { id: user.id } as any,
      tag,
      videoUrl,
      imageUrl: null,
      previewImageUrl,
      isPublished: false,
      isSaved: true,
      generationParams: {
        prompt,
        aiService: AudioAIEnum.MIRELO_SFX_VIDEO_TO_VIDEO,
        width: width || undefined,
        height: height || undefined,
        suggestedTags: suggestedTags?.length ? suggestedTags : undefined,
      },
    });
    return await this.postRepository.save(post);
  }

  async getPostById(postId: number): Promise<PostEntity | null> {
    return await this.postRepository.findOne({ where: { id: postId } });
  }

  async updateUserCredits(user: UserEntity, aiService: AudioAIEnum) {
    const cost = await this.getCostByService(aiService);
    user.points -= cost;
    await this.userEntity.save(user);
    await this.notificationGateway.emitProfileUpdate(user.id.toString());
    return cost;
  }

  public async logActivityAndNotify(
    userId: number,
    activityType: ActivityEnum,
    service?: AudioAIEnum,
    generationCost?: number,
  ) {
    let cost = generationCost;
    if (!cost && service) {
      cost = await this.getCostByService(service);
    }

    const description = await this.activityService.createActivitiesV2({
      fromUserId: null,
      toUserIds: [userId],
      type: activityType,
      isAdmin: false,
      service: service as any,
      generationCost: cost,
    });
    await this.notificationGateway.sendNotification(
      userId.toString(),
      description,
      activityType,
    );
  }
}

