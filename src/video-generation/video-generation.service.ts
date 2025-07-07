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
    const defaultSettings = {
      defaultAI: VideoAIEnum.BYTY_DANCE,
      cost: 100,
    };

    const aiSettings = [
      {
        id: VideoAIEnum.BYTY_DANCE,
        name: 'Byty Dance',
        cost: 100,
        description: 'Create animated videos from your image with BytyDance.',
      },
    ];

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
  ): Promise<PostEntity> {
    console.log(tag);
    const post = this.postRepository.create({
      user: { id: user.id },
      tag,
      videoUrl,
      is_published: false,
      is_saved: false,
    });

    return await this.postRepository.save(post);
  }

  async findBestTagByImage(imageUrl: string): Promise<TagEntity> {
    const tags = await this.tagRepository.find();
    const tagNames = tags.map((t) => t.name);
    const messages: any = [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: imageUrl, detail: 'auto' },
          },
          {
            type: 'text',
            text: `Given this image and the following list of tags: [${tagNames.join(', ')}], 
  identify the single most relevant tag that best represents the subject or theme of the image. 
  Return only the tag name.`,
          },
        ],
      },
    ];

    const response = await this.openai.chat.completions.create({
      model: 'o4-mini-2025-04-16',
      messages,
      max_completion_tokens: 20,
    });

    const tagName = response.choices?.[0]?.message?.content?.trim();
    const selectedTag = tags.find(
      (t) => t.name.toLowerCase() === tagName?.toLowerCase(),
    );

    return selectedTag ?? tags[0]; // fallback
  }

  async generateVideo(dto: GenerateVideoDto) {
    let token: AiServiceToken;
    // let tag: TagEntity;
    try {
      // const suggestedTags = [];
      // if (createPostDto.auto_tag_select) {
      //   tag = await this.findBestTag(createPostDto.prompt);
      //   suggestedTags.push({
      //     id: tag.id,
      //     name: '#' + tag.name,
      //     imageUrl: tag.imageUrl,
      //   });
      // } else {
      //   tag = await this.tagEntity.findOne({
      //     where: { id: createPostDto.tag_id },
      //   });
      //   suggestedTags.push({
      //     id: tag.id,
      //     name: '#' + tag.name,
      //     imageUrl: tag.imageUrl,
      //   });
      // }

      // const otherTag = await this.tagEntity.findOne({
      //   where: { name: 'other' },
      // });
      // suggestedTags.push({
      //   id: otherTag.id,
      //   name: '#' + otherTag.name,
      //   imageUrl: otherTag.imageUrl,
      // });

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
