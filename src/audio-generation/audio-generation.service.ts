import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AISettingsEntity } from 'src/image-generation/entities/ai-settings.entity';
import * as fal from '@fal-ai/serverless-client';
import axios from 'axios';
import { UploadService } from 'src/upload/upload.service';
import { ServiceTokenService } from 'src/service-token/service-token.service';
import { UserEntity } from 'src/user/entities/user.entity';
import { PostEntity } from 'src/post/entities/post.entity';
import { TagEntity } from 'src/tag/entities/tag.entity';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { ActivityService } from 'src/activity/activity.service';
import { ActivityEnum } from 'src/activity/types/activity.enum';
import { AUDIO_GENERATION_JOB, AUDIO_GENERATION_QUEUE } from './audio-generation.constants';
import { GenerateAudioDto } from './dto/generate-audio.dto';

@Injectable()
export class AudioGenerationService {
  constructor(
    @InjectRepository(AISettingsEntity)
    private readonly aiSettingsRepository: Repository<AISettingsEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectRepository(TagEntity)
    private readonly tagRepository: Repository<TagEntity>,
    @InjectQueue(AUDIO_GENERATION_QUEUE)
    private readonly audioQueue: Queue,
    private readonly serviceTokenService: ServiceTokenService,
    private readonly uploadService: UploadService,
    private readonly notificationGateway: NotificationGateway,
    private readonly activityService: ActivityService,
  ) {}

  async getAllAISettings() {
    const audioSettingsFromDb = await this.aiSettingsRepository.find({
      where: {
        type: 'audio',
        isActive: true,
      },
      order: { id: 'ASC' },
    });

    if (audioSettingsFromDb.length === 0) {
      return {
        defaultSettings: {
          defaultAI: null,
          cost: 0,
        },
        aiSettings: [],
      };
    }

    const defaultSettings = {
      defaultAI: audioSettingsFromDb[0].aiService,
      cost: audioSettingsFromDb[0].cost,
    };

    const aiSettings = audioSettingsFromDb.map((setting) => ({
      id: setting.aiService,
      name: setting.name,
      cost: setting.cost,
      description: setting.description,
      api_model: setting.apiModel,
    }));

    return {
      defaultSettings,
      aiSettings,
    };
  }

  async addAudioTaskToQueue(dto: GenerateAudioDto, userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    await this.verifyUserHasEnoughCredits(user, dto.ai_service);

    const jobOptions = {
      attempts: 3,
      backoff: 15000,
      removeOnComplete: true,
      removeOnFail: false,
    };

    return await this.audioQueue.add(
      AUDIO_GENERATION_JOB,
      { dto, userId, aiService: dto.ai_service },
      jobOptions,
    );
  }

  private async verifyUserHasEnoughCredits(user: UserEntity, aiService: string) {
    const cost = await this.getCostByService(aiService);
    if (user.points < cost) {
      throw new BadRequestException('Not enough credits to generate audio');
    }
  }

  async getCostByService(service: string): Promise<number> {
    const aiSetting = await this.aiSettingsRepository.findOne({
      where: { aiService: service, isActive: true, type: 'audio' },
    });
    if (!aiSetting) {
      throw new BadRequestException(
        `AI service ${service} not found in ai_settings or is inactive`,
      );
    }
    return aiSetting.cost;
  }

  async generateAudio(dto: GenerateAudioDto): Promise<{ uploadedVideoUrl: string }> {
    const prompt = (dto?.prompt ?? '').trim();
    if (!prompt) {
      throw new BadRequestException('prompt is required');
    }

    // ensure video_url reachable
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

    const aiSetting = await this.aiSettingsRepository.findOne({
      where: { aiService: dto.ai_service, type: 'audio', isActive: true },
    });
    if (!aiSetting?.apiModel) {
      throw new BadRequestException('Invalid AI service selected or apiModel not found');
    }

    const token = await this.serviceTokenService.getNextAvailableToken(dto.ai_service as any);
    fal.config({ credentials: token.token });

    const input: any = {
      video_url: dto.video_url,
      prompt,
      duration: 8,
    };

    let result: any;
    try {
      result = await (fal.run as any)(aiSetting.apiModel, { input });
    } catch (error: any) {
      const details =
        error?.body ??
        error?.response?.data ??
        error?.data ??
        error?.message ??
        error;
      console.error(
        '[AudioGenerationService.generateAudio] fal.run failed',
        JSON.stringify({ aiService: dto.ai_service, apiModel: aiSetting.apiModel, input, error: details }, null, 2),
      );
      throw error;
    }

    const rawVideoUrl =
      result?.video?.url ?? result?.video?.[0]?.url;
    if (!rawVideoUrl) {
      throw new Error(`Audio model returned no video. Result: ${JSON.stringify(result)}`);
    }

    const uploadedVideoUrl = await this.uploadService.uploadVideoByUrl(rawVideoUrl);
    if (!uploadedVideoUrl) {
      throw new Error('Failed to upload video: upload service returned no URL');
    }

    return { uploadedVideoUrl };
  }

  async getDefaultTag(): Promise<TagEntity> {
    const other = await this.tagRepository.findOne({ where: { name: 'other' } });
    if (other) return other;
    const tags = await this.tagRepository.find();
    return tags[0];
  }

  async buildSuggestedTags(tag: TagEntity): Promise<{ id: number; name: string; imageUrl: string }[]> {
    const suggestedTags: { id: number; name: string; imageUrl: string }[] = [];
    if (tag) {
      suggestedTags.push({ id: tag.id, name: '#' + tag.name, imageUrl: tag.imageUrl });
    }
    return suggestedTags;
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

  async getVideoDimensionsSafe(videoUrl: string): Promise<{ width: number; height: number } | null> {
    // keep simple: we don't need dimensions for now
    return null;
  }

  async createPostForAudioVideo(
    videoUrl: string,
    user: UserEntity,
    tag: TagEntity,
    prompt: string,
    aiService: string,
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
      hasAudio: true,
      previewImageUrl,
      isPublished: false,
      isSaved: true,
      generationParams: {
        prompt,
        aiService,
        width: width || undefined,
        height: height || undefined,
        suggestedTags: suggestedTags?.length ? suggestedTags : undefined,
      },
    });
    return await this.postRepository.save(post);
  }

  async updateUserCredits(user: UserEntity, aiService: string) {
    const cost = await this.getCostByService(aiService);
    user.points -= cost;
    await this.userRepository.save(user);
    await this.notificationGateway.emitProfileUpdate(user.id.toString());
    return cost;
  }

  public async logActivityAndNotify(
    userId: number,
    activityType: ActivityEnum,
    service?: string,
    generationCost?: number,
  ) {
    const description = await this.activityService.createActivitiesV2({
      fromUserId: null,
      toUserIds: [userId],
      type: activityType,
      isAdmin: false,
      service: service as any,
      generationCost,
    });
    await this.notificationGateway.sendNotification(
      userId.toString(),
      description,
      activityType,
    );
  }
}

