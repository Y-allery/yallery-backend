import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { GenerateVideoDto } from './dto/generate-video.dto';
import { Queue } from 'bullmq';
import { AIEnum, VideoAIEnum } from 'src/common/enums/ai.enum';
import { InjectQueue } from '@nestjs/bullmq';
import { AiServiceToken } from 'src/service-token/entities/service-token.entity';
import { ServiceTokenService } from 'src/service-token/service-token.service';
import * as fal from '@fal-ai/serverless-client';
import { UploadService } from 'src/upload/upload.service';
import { UserEntity } from 'src/user/entities/user.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { ActivityEnum } from 'src/activity/types/activity.enum';
import { ActivityService } from 'src/activity/activity.service';
import { UserService } from 'src/user/user.service';
import { PostEntity } from 'src/post/entities/post.entity';
import { TagEntity } from 'src/tag/entities/tag.entity';
import { AISettingsEntity } from 'src/image-generation/entities/ai-settings.entity';
import OpenAI from 'openai';
import { v2 as cloudinary } from 'cloudinary';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class VideoGenerationService {
  private openai;

  constructor(
    @InjectQueue(VideoAIEnum.BYTY_DANCE) private readonly bytyDance: Queue,
    private readonly serviceTokenService: ServiceTokenService,
    private readonly uploadService: UploadService,
    private readonly activityService: ActivityService,
    private readonly userService: UserService,

    @InjectRepository(UserEntity)
    private userEntity: Repository<UserEntity>,
    @InjectRepository(PostEntity)
    private postRepository: Repository<PostEntity>,
    @InjectRepository(TagEntity)
    private tagRepository: Repository<TagEntity>,
    @InjectRepository(AISettingsEntity)
    private aiSettingsRepository: Repository<AISettingsEntity>,

    private readonly notificationGateway: NotificationGateway,
    private readonly configService: ConfigService,
  ) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    // Initialize Cloudinary config for video metadata
    cloudinary.config({
      cloud_name: this.configService.get('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get('CLOUDINARY_API_SECRET'),
    });
  }

  private async verifyUserHasEnoughCredits(user: UserEntity, aiService: VideoAIEnum) {
    const totalCost = await this.getCostByService(aiService);
    if (user.points < totalCost) {
      throw new BadRequestException('Not enough credits to generate video');
    }
  }

  async getCostByService(service: VideoAIEnum): Promise<number> {
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
    const videoAISettingsFromDb = await this.aiSettingsRepository.find({
      where: { 
        type: 'video',
        isActive: true 
      },
      order: { id: 'ASC' },
    });

    if (videoAISettingsFromDb.length === 0) {
      return {
        defaultSettings: {
          defaultAI: VideoAIEnum.BYTY_DANCE,
          cost: 0,
        },
        aiSettings: [],
      };
    }

    const defaultSettings = {
      defaultAI: VideoAIEnum.BYTY_DANCE,
      cost: videoAISettingsFromDb[0].cost,
    };

    const aiSettings = videoAISettingsFromDb.map((setting) => ({
      id: setting.aiService,
      name: setting.name,
      cost: setting.cost,
      description: setting.description || 'Create animated videos from your image with BytyDance.',
      api_model: setting.apiModel,
    }));

    return {
      defaultSettings,
      aiSettings,
    };
  }
  async addVideoTaskToQueue(dto: GenerateVideoDto, userId: number) {
    try {
      const user = await this.userService.findById(userId);
      await this.verifyUserHasEnoughCredits(user, dto.ai_service);

      const jobOptions = {
        attempts: 3,
        backoff: 15000,
        removeOnComplete: true,
        removeOnFail: false,
      };

      const aiService = dto.ai_service;
      let queue: Queue;

      switch (aiService) {
        case VideoAIEnum.BYTY_DANCE:
          queue = this.bytyDance;
          break;

        default:
          throw new HttpException('Invalid AI service', HttpStatus.BAD_REQUEST);
      }

      return await queue.add(aiService, { dto, userId }, jobOptions);
    } catch (error) {
      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async createPostForVideo(
    videoUrl: string,
    user: UserEntity,
    tag: TagEntity,
    dto?: GenerateVideoDto,
    suggestedTags?: { id: number; name: string }[],
    width?: number,
    height?: number,
  ): Promise<PostEntity> {
    // Ensure suggestedTags has at least "other" tag
    let finalSuggestedTags = suggestedTags || [];
    if (finalSuggestedTags.length === 0) {
      const otherTag = await this.tagRepository.findOne({
        where: { name: 'other' },
      });
      if (otherTag) {
        finalSuggestedTags = [{ id: otherTag.id, name: otherTag.name }];
      }
    }

    const post = this.postRepository.create({
      user: { id: user.id },
      tag,
      videoUrl,
      imageUrl: null,
      previewImageUrl: dto?.image_url ?? null,
      isPublished: false,
      isSaved: true, // Mark as saved so it appears in unpublished gallery
      generationParams: dto
        ? {
            prompt: dto.prompt,
            aiService: dto.ai_service,
            orientation: undefined,
            style_id: undefined,
            color_id: undefined,
            width: width || undefined,
            height: height || undefined,
            negative_prompt: undefined,
            suggestedTags: finalSuggestedTags.length > 0 ? finalSuggestedTags : undefined,
          }
        : {
            suggestedTags: finalSuggestedTags.length > 0 ? finalSuggestedTags : undefined,
          },
    });

    return await this.postRepository.save(post);
  }

  async getPostById(postId: number): Promise<PostEntity | null> {
    return await this.postRepository.findOne({
      where: { id: postId },
    });
  }

  async findBestTagByImage(imageUrl: string): Promise<TagEntity> {
    const tags = await this.tagRepository.find();
    const tagNames = tags.map((t) => t.name);
    // tagNames and imageUrl are used only for debug; avoid noisy logging in production
    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: imageUrl,
              detail: 'auto',
            },
          },
          {
            type: 'text',
            text: `Given this image and the following list of tags: [${tagNames.join(', ')}], 
    please return only the most relevant tag name.`,
          },
        ],
      },
    ];

    const response = await this.openai.chat.completions.create({
      model: 'o4-mini-2025-04-16',
      messages,
      max_completion_tokens: 10000,
    });

    const tagName = response.choices?.[0]?.message?.content?.trim();

    const selectedTag = tags.find(
      (t) => t.name.toLowerCase() === tagName?.toLowerCase(),
    );

    return selectedTag ?? tags[0];
  }

  async generateVideo(dto: GenerateVideoDto): Promise<{
    uploadedVideoUrl: string;
  }> {
    let token: AiServiceToken;
    try {
      console.log(`[generateVideo] Starting | Service: ${dto.ai_service} | Prompt: ${dto.prompt.substring(0, 50)}...`);
      
      token = await this.serviceTokenService.getNextAvailableToken(
        dto.ai_service,
      );

      if (!token) {
        throw new BadRequestException(
          'No tokens available for the selected AI service',
        );
      }
      fal.config({
        credentials: token.token,
      });

      const aiSetting = await this.aiSettingsRepository.findOne({
        where: { 
          aiService: dto.ai_service,
          type: 'video',
          isActive: true 
        },
      });

      if (!aiSetting || !aiSetting.apiModel) {
        throw new BadRequestException('Invalid AI service selected or apiModel not found');
      }

      const serviceName = aiSetting.apiModel;

      const generateMethod = fal.run.bind(fal, serviceName);

      const inputParams: any = {
        prompt: dto.prompt,
        image_url: dto.image_url,
      };
      const result = await generateMethod({
        input: inputParams,
      });

      if (!result || !result.video || !result.video.url) {
        throw new Error(
          `Video generation service ${dto.ai_service} returned no video. Result: ${JSON.stringify(result)}`,
        );
      }

      const videoUrl = result.video.url;

      const uploadedVideoUrl = await this.uploadService.uploadVideoByUrl(videoUrl);

      if (!uploadedVideoUrl) {
        throw new Error('Failed to upload video: upload service returned no URL');
      }

      return { uploadedVideoUrl };
    } catch (error) {
      if (token?.token) {
        await this.serviceTokenService.markTokenAsRateLimited(
          token,
          dto.ai_service,
        );
      }

      throw new Error(`Failed to generate video: ${error.message}`);
    }
  }

  async updateUserCredits(user: UserEntity, aiService: VideoAIEnum) {
    const videoCost = await this.getCostByService(aiService);
    user.points -= videoCost;
    await this.userEntity.save(user);
    await this.notificationGateway.emitProfileUpdate(user.id.toString());
    return videoCost;
  }

  public async logActivityAndNotify(
    userId: number,
    activityType: ActivityEnum,
    service?: VideoAIEnum,
    generationCost?: number,
  ) {
    // Якщо generationCost не передано, беремо з ai_settings
    let cost = generationCost;
    if (!cost && service) {
      cost = await this.getCostByService(service);
    }

    const description = await this.activityService.createActivities(
      null,
      [userId],
      activityType,
      undefined,
      false,
      undefined,
      undefined,
      service as any,
      cost,
    );
    await this.notificationGateway.sendNotification(
      userId.toString(),
      description,
      activityType,
    );
  }

  async getDefaultTag(): Promise<TagEntity> {
    const tags = await this.tagRepository.find();
    return tags[0];
  }

  async buildSuggestedTags(tag: TagEntity): Promise<{ id: number; name: string; imageUrl: string }[]> {
    const suggestedTags = [];
    
    if (tag) {
      suggestedTags.push({
        id: tag.id,
        name: '#' + tag.name,
        imageUrl: tag.imageUrl,
      });
    }

    const otherTag = await this.tagRepository.findOne({
      where: { name: 'other' },
    });
    
    if (!otherTag) {
      throw new Error('Tag "other" not found in database');
    }
    
    suggestedTags.push({
      id: otherTag.id,
      name: '#' + otherTag.name,
      imageUrl: otherTag.imageUrl,
    });

    return suggestedTags;
  }

  async getVideoDimensions(videoUrl: string): Promise<{ width: number; height: number } | null> {
    try {
      // Check if URL is from Cloudinary
      if (!videoUrl.includes('cloudinary.com')) {
        console.warn(`[getVideoDimensions] Video URL is not from Cloudinary: ${videoUrl}`);
        return null;
      }

      // Extract public_id from Cloudinary URL
      const urlParts = videoUrl.split('/');
      const uploadIndex = urlParts.indexOf('upload');
      
      if (uploadIndex === -1 || uploadIndex + 1 >= urlParts.length) {
        console.warn(`[getVideoDimensions] Could not find 'upload' segment in URL: ${videoUrl}`);
        return null;
      }

      // Get all segments after 'upload'
      const segmentsAfterUpload = urlParts.slice(uploadIndex + 1);
      
      // Remove version if present (starts with 'v' followed by digits)
      const segmentsWithoutVersion = segmentsAfterUpload.filter(
        (segment, index) => !(index === 0 && /^v\d+$/.test(segment))
      );
      
      // Join segments and remove file extension
      const publicIdWithExtension = segmentsWithoutVersion.join('/');
      // Remove extension (mp4, webm, mov, avi, etc.)
      const publicId = publicIdWithExtension.replace(/\.[^/.]+$/, '');

      if (!publicId) {
        console.warn(`[getVideoDimensions] Could not extract public_id from URL: ${videoUrl}`);
        return null;
      }

      // Get video metadata from Cloudinary API
      const result = await cloudinary.api.resource(publicId, {
        resource_type: 'video',
      });

      if (result && result.width && result.height) {
        return {
          width: Number(result.width),
          height: Number(result.height),
        };
      }

      return null;
    } catch (error) {
      console.warn(`[getVideoDimensions] Failed to get video dimensions from ${videoUrl}:`, error?.message || error);
      return null;
    }
  }
}
