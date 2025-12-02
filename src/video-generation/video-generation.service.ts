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
  ) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  private async verifyUserHasEnoughCredits(user: UserEntity) {
    const totalCost = 100;
    if (user.points < totalCost) {
      throw new BadRequestException('Not enough credits to generate images');
    }
  }

  async getAllAISettings() {
    // Отримуємо налаштування відео AI з бази даних
    const videoAISettingsFromDb = await this.aiSettingsRepository.find({
      where: { 
        ai_service: VideoAIEnum.BYTY_DANCE,
        is_active: true 
      },
      order: { id: 'ASC' },
    });

    // Формуємо defaultSettings з першої активної моделі
    const defaultSettings = videoAISettingsFromDb.length > 0
      ? {
          defaultAI: VideoAIEnum.BYTY_DANCE,
          cost: videoAISettingsFromDb[0].cost,
        }
      : {
          defaultAI: VideoAIEnum.BYTY_DANCE,
          cost: 100,
        };

    // Формуємо aiSettings з даних БД
    const aiSettings = videoAISettingsFromDb.map((setting) => ({
      id: setting.ai_service,
      name: setting.name,
      cost: setting.cost,
      description: setting.description || 'Create animated videos from your image with BytyDance.',
    }));

    // Якщо в БД немає налаштувань, повертаємо дефолтні
    if (aiSettings.length === 0) {
      return {
        defaultSettings: {
          defaultAI: VideoAIEnum.BYTY_DANCE,
          cost: 100,
        },
        aiSettings: [
          {
            id: VideoAIEnum.BYTY_DANCE,
            name: 'Byty Dance',
            cost: 100,
            description: 'Create animated videos from your image with BytyDance.',
          },
        ],
      };
    }

    return {
      defaultSettings,
      aiSettings,
    };
  }
  async addVideoTaskToQueue(dto: GenerateVideoDto, userId: number) {
    try {
      const user = await this.userService.findById(userId);
      await this.verifyUserHasEnoughCredits(user);

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
      console.log(error);
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
  ): Promise<PostEntity> {
    const post = this.postRepository.create({
      user: { id: user.id },
      tag,
      videoUrl,
      imageUrl: null,
      is_published: false,
      is_saved: false,
      generation_params: dto
        ? {
            prompt: dto.prompt,
            ai_service: dto.ai_service,
            orientation: undefined, // Для відео орієнтація не застосовується
            style_id: undefined,
            color_id: undefined,
            width: undefined,
            height: undefined,
            negative_prompt: undefined,
          }
        : null,
    });

    return await this.postRepository.save(post);
  }

  async findBestTagByImage(imageUrl: string): Promise<TagEntity> {
    const tags = await this.tagRepository.find();
    const tagNames = tags.map((t) => t.name);
    console.log(tagNames);
    console.log(imageUrl);
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

  async generateVideo(dto: GenerateVideoDto) {
    let token: AiServiceToken;
    try {
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

      const serviceMapping: { [key in VideoAIEnum]: string } = {
        [VideoAIEnum.BYTY_DANCE]:
          'fal-ai/bytedance/seedance/v1/lite/image-to-video',
      };

      const serviceName = serviceMapping[dto.ai_service];

      if (!serviceName) {
        throw new BadRequestException('Invalid AI service selected');
      }

      const generateMethod = fal.run.bind(fal, serviceName);

      const inputParams: any = {
        prompt: dto.prompt,
        image_url: dto.image_url,
      };
      const result = await generateMethod({
        input: inputParams,
      });

      const videoUrl = result.video?.url;

      let uploadedVideoUrl: string | null = null;
      if (videoUrl) {
        uploadedVideoUrl = await this.uploadService.uploadVideoByUrl(videoUrl);
      }

      return { uploadedVideoUrl };
    } catch (error) {
      if (token?.token) {
        await this.serviceTokenService.markTokenAsRateLimited(
          token,
          dto.ai_service,
        );
      }

      throw new Error(`Failed to generate images: ${error.message}`);
    }
  }

  async updateUserCredits(user: UserEntity) {
    user.points -= 100;
    await this.userEntity.save(user);
    await this.notificationGateway.emitProfileUpdate(user.id.toString());
  }

  public async logActivityAndNotify(
    userId: number,
    activityType: ActivityEnum,
    service?: AIEnum,
    generationCost?: number,
  ) {
    const description = await this.activityService.createActivities(
      null,
      [userId],
      activityType,
      undefined,
      false,
      undefined,
      undefined,
      service,
      generationCost,
    );
    await this.notificationGateway.sendNotification(
      userId.toString(),
      description,
      activityType,
    );
  }
}
