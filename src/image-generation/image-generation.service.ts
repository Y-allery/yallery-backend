import {
  Injectable,
  HttpException,
  HttpStatus,
  BadRequestException,
  forwardRef,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadService } from 'src/upload/upload.service';
import { GenerateImageDto } from './dto/generate.image.dto';
import { AIEnum } from 'src/common/enums/ai.enum';
import { PostEntity } from 'src/post/entities/post.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { TagEntity } from 'src/tag/entities/tag.entity';
import { StyleEntity } from 'src/post/entities/style.entity';
import { In, Repository } from 'typeorm';
import { getDimensionsForOrientation } from 'src/common/helpers/get.dimension.func';
import { ColorEntity } from './entities/color.entity';
import { AISettings } from './types/ai.settings.interface';
import { PostService } from 'src/post/post.service';
import { UserEntity } from 'src/user/entities/user.entity';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { ActivityService } from 'src/activity/activity.service';
import { ActivityEnum } from 'src/activity/types/activity.enum';
import { UserService } from 'src/user/user.service';
import { SdxlStyles } from '@octoai/sdk/api/resources/imageGen';
import { ContestEntity } from 'src/contest/entity/contest.entity';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { AiServiceToken } from 'src/service-token/entities/service-token.entity';
import { ServiceTokenService } from 'src/service-token/service-token.service';
import * as fal from '@fal-ai/serverless-client';
import OpenAI from 'openai';
import * as leoProfanity from 'leo-profanity';
import axios from 'axios';

@Injectable()
export class ImageGenerationService {
  @InjectRepository(ContestEntity)
  private readonly contestRepository: Repository<ContestEntity>;
  private readonly aiDescription = [
    'Flux: A versatile model for abstract art, surreal designs, and conceptual visuals.',
    'Aura: Specializes in soft, atmospheric, dream-like imagery, perfect for ethereal landscapes and mood-based scenes.',
    'Realistic Vision: Excels in detailed, photorealistic images, including lifelike portraits and realistic environments',
  ];
  private readonly defaultSettings: Record<string, any> = {
    defaultAI: 'flux',
    defaultStyle: 12,
    defaultSize: '1024x1024',
    defaultOrientations: 'vertical',
    defaultColor: 1,
  };
  private readonly aiSettings: Record<AIEnum, AISettings> = {
    [AIEnum.AURA_FLOW]: {
      id: 'aura_flow',
      name: 'Ideogram',
      allowedOrientations: ['horizontal', 'vertical'],
      minImages: 1,
      maxImages: 5,
      maxPromptLength: 1000,
      sizes: ['1024x1024', '1536x640', '768x1344'],
    },
    [AIEnum.FLUX]: {
      id: 'flux',
      name: 'FLUX AI',
      allowedOrientations: ['horizontal', 'vertical'],
      minImages: 1,
      maxImages: 5,
      maxPromptLength: 1000,
      sizes: ['1024x1024', '1536x640', '768x1344'],
    },
    [AIEnum.REALISTIC_VISION]: {
      id: 'realistic_vision',
      name: 'Realistic AI',
      allowedOrientations: ['horizontal', 'vertical'],
      minImages: 1,
      maxImages: 5,
      maxPromptLength: 1000,
      sizes: ['1024x1024', '1536x640', '768x1344'],
    },
    [AIEnum.FLUX_PRO_FINE_TUNE]: {
      id: 'flux_pro_fine_tune',
      name: 'Flux PRO Fine Tune',
      allowedOrientations: ['horizontal', 'vertical'],
      minImages: 1,
      maxImages: 2,
      maxPromptLength: 1000,
      sizes: ['1024x1024', '1536x640', '768x1344'],
    },
  };
  private openai;
  constructor(
    private readonly uploadService: UploadService,
    private readonly userService: UserService,
    private readonly activityService: ActivityService,
    private readonly serviceTokenService: ServiceTokenService,
    private readonly notificationGateway: NotificationGateway,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => PostService))
    private postService: PostService,
    @InjectRepository(PostEntity)
    private postEntity: Repository<PostEntity>,
    @InjectRepository(TagEntity)
    private tagEntity: Repository<TagEntity>,
    @InjectRepository(StyleEntity)
    private styleEntity: Repository<StyleEntity>,
    @InjectRepository(ColorEntity)
    private colorEntity: Repository<ColorEntity>,
    @InjectRepository(UserEntity)
    private userEntity: Repository<UserEntity>,
    @InjectQueue(AIEnum.FLUX) private readonly fluxQueue: Queue,
    @InjectQueue(AIEnum.AURA_FLOW) private readonly auraQueue: Queue,
    @InjectQueue(AIEnum.REALISTIC_VISION)
    private readonly turboDiffusionQueue: Queue,
    @InjectQueue(AIEnum.FLUX_PRO_FINE_TUNE)
    private readonly fluxProFineTune: Queue,
  ) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async generateFalAi(createPostDto: GenerateImageDto): Promise<{
    generatedImages: string[];
    suggestedTags: { id: number; name: string }[];
  }> {
    let token: AiServiceToken;
    let tag: TagEntity;
    try {
      const suggestedTags = [];
      if (createPostDto.auto_tag_select) {
        tag = await this.findBestTag(createPostDto.prompt);
        suggestedTags.push({
          id: tag.id,
          name: '#' + tag.name,
          imageUrl: tag.imageUrl,
        });
      } else {
        tag = await this.tagEntity.findOne({
          where: { id: createPostDto.tag_id },
        });
        suggestedTags.push({
          id: tag.id,
          name: '#' + tag.name,
          imageUrl: tag.imageUrl,
        });
      }

      const otherTag = await this.tagEntity.findOne({
        where: { name: 'other' },
      });
      suggestedTags.push({
        id: otherTag.id,
        name: '#' + otherTag.name,
        imageUrl: otherTag.imageUrl,
      });

      token = await this.serviceTokenService.getNextAvailableToken(
        createPostDto.ai_service,
      );

      if (!token) {
        throw new BadRequestException(
          'No tokens available for the selected AI service',
        );
      }
      fal.config({
        credentials: token.token,
      });

      const serviceMapping: { [key in AIEnum]: string } = {
        [AIEnum.AURA_FLOW]: 'fal-ai/ideogram/v2',
        [AIEnum.FLUX]: 'fal-ai/flux-pro/v1.1-ultra',
        [AIEnum.REALISTIC_VISION]: 'fal-ai/realistic-vision',
        [AIEnum.FLUX_PRO_FINE_TUNE]: 'fal-ai/flux-pro/v1.1-ultra-finetuned',
      };

      const serviceName = serviceMapping[createPostDto.ai_service];

      if (!serviceName) {
        throw new BadRequestException('Invalid AI service selected');
      }

      const generateMethod = fal.run.bind(fal, serviceName);

      let inputParams: any = {
        prompt: createPostDto.prompt,
        numImages: createPostDto.image_quantity,
        aspect_ratio:
          createPostDto.width === 1024 && createPostDto.height === 1024
            ? '1:1'
            : createPostDto.width === 768 && createPostDto.height === 1344
              ? '3:4'
              : createPostDto.width === 1344 && createPostDto.height === 768
                ? '16:9'
                : undefined,
        negativePrompt: 'Blurry photo, distortion, low-res, poor quality',
        num_images: createPostDto.image_quantity,
      };

      if (AIEnum.FLUX_PRO_FINE_TUNE === createPostDto.ai_service) {
        const contest = await this.contestRepository.findOne({
          where: { id: createPostDto.contest_id },
        });
        inputParams = {
          prompt: `Generate me ${contest.fineTuneTriggerWord}.${createPostDto.prompt}`,
          finetune_id: contest.fineTuneToken,
          output_format: 'jpeg',
          safety_tolerance: 2,
          num_images: createPostDto.image_quantity,
          guidance_scale: 15,
          num_inference_steps: 28,
          finetune_strength: +contest.fineTuneStrength || 1,
        };
      }

      const start = Date.now();

      console.log(inputParams);
      const result = await generateMethod({
        input: inputParams,
      });

      const end = Date.now();
      console.log(
        `Fal AI (${createPostDto.ai_service}) responded in ${end - start} ms`,
      );
      const uploadPromises = result.images.map(async (image) => {
        const dataUrl = image.url;

        const uploadResponse = await this.uploadService.uploadByUrl(dataUrl);

        return uploadResponse;
      });

      const uploadResponses = await Promise.all(uploadPromises);

      return { generatedImages: uploadResponses, suggestedTags };
    } catch (error) {
      if (token?.token) {
        await this.serviceTokenService.markTokenAsRateLimited(
          token,
          createPostDto.ai_service,
        );
      }

      throw new Error(`Failed to generate images: ${error.message}`);
    }
  }

  async generateImages(createPostDto: GenerateImageDto, userId: number) {
    const user = await this.getUser(userId);
    await this.verifyUserHasEnoughCredits(user, createPostDto);

    await this.ensureUserCanParticipateInContest(
      user.id,
      createPostDto.contest_id,
    );

    const { style, color } = await this.fetchAndValidateEntities(createPostDto);

    await this.prepareDtoForGeneration(createPostDto, style, color);

    return await this.generateImagesUsingService(createPostDto, userId);
  }

  async findBestTag(prompt: string): Promise<TagEntity> {
    const tags = await this.tagEntity.find();

    const tagDescriptions = tags
      .map((tag) => `ID: ${tag.id}, Name: ${tag.name}`)
      .join('\n');

    const chatPrompt = `
      Based on the following tags:
      ${tagDescriptions}
  
      And the prompt: "${prompt}",
      
      Please select the most appropriate **single** tag from the following possible tags:
      ${tagDescriptions}.
      
      The tag should reflect the main subject of the image described in the prompt.
      
      If you cannot determine the best tag with certainty, please select the tag that best represents the **primary subject** of the image.
      The most relevant subject in the prompt should be the deciding factor for the tag selection. For example:
      - If the image is focused on a woman, select the tag related to "people" or "girl".
      - If the image is focused on a car, select the tag related to "cars".
      - If the image is focused on a forest, select the tag related to "forest" or "nature".
  
      Please return the response in the following JSON format:
      {
        "tag_id": <ID of the most suitable tag>
      }
      
      Please choose the most relevant and **single** tag for the primary subject of the image.
    `;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: chatPrompt,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 100,
      temperature: 0,
    });

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(response.choices[0].message.content.trim());
    } catch (error) {
      console.log('Error parsing response:', error);
      return tags[0];
    }

    let tagId = parsedResponse?.tag_id;

    if (!tagId || isNaN(tagId)) {
      console.log(
        "Couldn't determine the best tag. Falling back to default tag.",
      );
      tagId = tags[0]?.id || null;
    }

    const bestTag = tags.find((tag) => tag.id === tagId);

    if (!bestTag) {
      console.log(
        `Tag with ID ${tagId} not found in the database. Returning the first tag.`,
      );
      return tags[0];
    }

    return bestTag;
  }

  private async verifyUserHasEnoughCredits(
    user: UserEntity,
    createPostDto: GenerateImageDto,
  ) {
    const totalCost = this.calculateTotalCost(
      createPostDto.ai_service,
      createPostDto.image_quantity,
    );
    if (user.points < totalCost) {
      throw new BadRequestException('Not enough credits to generate images');
    }
  }

  private async ensureUserCanParticipateInContest(
    userId: number,
    contestId: number = null,
  ) {
    if (contestId) {
      const contest = await this.contestRepository.findOne({
        where: { id: contestId },
      });
      if (!contest) throw new NotFoundException('Contest not found');
    }
  }

  private async fetchAndValidateEntities(createPostDto: GenerateImageDto) {
    const [tag, style, color] = await this.getEntities(createPostDto);
    this.validateEntities(tag, style, color, createPostDto);
    return { style, color };
  }

  async generateImagesUsingService(
    createPostDto: GenerateImageDto,
    userId: number,
  ): Promise<any> {
    try {
      const jobOptions = {
        attempts: 3,
        backoff: 15000,
        removeOnComplete: true,
        removeOnFail: false,
      };

      let queue;
      switch (createPostDto.ai_service) {
        case AIEnum.AURA_FLOW:
          queue = this.auraQueue;
          break;
        case AIEnum.FLUX:
          queue = this.fluxQueue;
          break;
        case AIEnum.REALISTIC_VISION:
          queue = this.turboDiffusionQueue;
          break;
        case AIEnum.FLUX_PRO_FINE_TUNE:
          queue = this.fluxProFineTune;
          break;

        default:
          throw new HttpException('Invalid AI service', HttpStatus.BAD_REQUEST);
      }

      return await this.addJobToQueue(
        queue,
        createPostDto.ai_service,
        createPostDto,
        userId,
        jobOptions,
      );
    } catch (error) {
      console.log(error);
    }
  }

  private async addJobToQueue(
    queue: any,
    aiService: AIEnum,
    createPostDto: GenerateImageDto,
    userId: number,
    jobOptions: any,
  ): Promise<any> {
    return await queue.add(aiService, { createPostDto, userId }, jobOptions);
  }
  async notifyUserOfImageGeneration(userId: number) {
    const user = await this.userEntity.findOne({ where: { id: userId } });
    const post = await this.postEntity.find({
      where: { user: { id: userId } },
    });
    if (
      (post.length === 1 && user.telegramId) ||
      (post.length === 2 && user.telegramId)
    ) {
      setTimeout(() => {
        axios
          .post(
            `https://api.telegram.org/bot${this.configService.get('TELEGRAM_BOT_TOKEN')}/sendPhoto`,
            {
              chat_id: user.telegramId,
              photo:
                'https://res.cloudinary.com/dsypundib/image/upload/v1748028655/photo_2025-05-23_15-13-31_qunweu.jpg',
              caption: `Download the Y'allery app from the store to get more functionality:`,
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: 'App Store',
                      url: 'https://apps.apple.com/us/app/yallery/id6456609257',
                    },
                    {
                      text: 'Google Play',
                      url: 'https://play.google.com/store/apps/details?id=app.yallery.y_allery_mobile_client&pli=1',
                    },
                  ],
                ],
              },
            },
          )
          .then((response) => {
            response;
          })
          .catch((error) => {
            console.error(
              'Error sending photo message:',
              error.response?.data || error,
            );
          });
      }, 180000);
    }
    await this.userService.sendPushNotificationIfEnabled(
      userId,
      ActivityEnum.IMAGE_GENERATE_SPEND,
    );
  }

  async saveGeneratedImages(
    generatedImages: string[],
    createPostDto: GenerateImageDto,
    user: UserEntity,
    service: AIEnum,
  ) {
    const posts = await Promise.all(
      generatedImages.map(async (imageUrl) => {
        return await this.createPostForImage(createPostDto, imageUrl, user);
      }),
    );

    const generationCost = this.getCostByService(
      service,
      createPostDto.image_quantity,
    );

    await this.logActivityAndNotify(
      user.id,
      ActivityEnum.IMAGE_GENERATE_SPEND,
      createPostDto.ai_service,
      generationCost,
    );

    return posts.map((e) => {
      return {
        imageUrl: e.imageUrl,
        id: e.id,
      };
    });
  }
  private async createPostForImage(
    createPostDto: GenerateImageDto,
    imageUrl: string,
    user: UserEntity,
  ) {
    return await this.postService.savePost(
      createPostDto,
      imageUrl,
      user.id,
      createPostDto.contest_id || null,
    );
  }

  async updateUserCredits(user: UserEntity, createPostDto: GenerateImageDto) {
    user.points -= this.calculateTotalCost(
      createPostDto.ai_service,
      createPostDto.image_quantity,
    );
    await this.userEntity.save(user);
    await this.notificationGateway.emitProfileUpdate(user.id.toString());
  }

  async getUser(userId: number) {
    const user = await this.userEntity.findOne({
      where: { id: userId },
      relations: { tags: true },
    });
    if (!user) throw new BadRequestException('User not found');
    return user;
  }

  private async getEntities(createPostDto: GenerateImageDto) {
    return await Promise.all([
      this.tagEntity.findOne({
        where: { id: createPostDto.tag_id },
        select: { name: true },
      }),
      createPostDto.style_id
        ? this.styleEntity.findOne({
            where: { id: createPostDto.style_id },
            select: { name: true },
          })
        : null,
      createPostDto.color_id
        ? this.colorEntity.findOne({ where: { id: createPostDto.color_id } })
        : null,
    ]);
  }

  private validateEntities(
    tag: TagEntity,
    style: StyleEntity,
    color: ColorEntity,
    createPostDto: GenerateImageDto,
  ) {
    if (!tag) throw new BadRequestException('Tag not found');
    if (createPostDto.style_id && !style)
      throw new BadRequestException('Style not found');
    if (createPostDto.color_id && !color)
      throw new BadRequestException('Color not found');
  }

  sanitizePrompt(prompt: string): string {
    if (leoProfanity.check(prompt)) {
      return 'Create a neutral and appropriate image.';
    }
    return prompt;
  }

  async prepareDtoForGeneration(
    createPostDto: GenerateImageDto,
    style: StyleEntity,
    color: ColorEntity,
  ) {
    createPostDto.prompt = this.sanitizePrompt(createPostDto.prompt);
    const { width, height } = getDimensionsForOrientation(
      createPostDto.orientation,
      createPostDto.ai_service,
    );

    let stylePrompt = '';
    const colorPrompt = color ? ` rendered in ${color.name} colors` : '';

    if (createPostDto.ai_service !== AIEnum.AURA_FLOW) {
      stylePrompt = style ? ` in ${style.name} style` : '';
    } else if (createPostDto.style_id) {
      const styleEntity = await this.styleEntity.findOne({
        where: { id: createPostDto.style_id },
      });
      if (styleEntity) {
        createPostDto.style = styleEntity.slug as SdxlStyles;
      }
    }

    if (!createPostDto.auto_tag_select && createPostDto.tag_id) {
      const tag = await this.tagEntity.findOne({
        where: { id: createPostDto.tag_id },
      });
      if (tag && createPostDto.ai_service !== AIEnum.FLUX_PRO_FINE_TUNE) {
        createPostDto.prompt = `Create a detailed and visually striking image that combines the concepts of "${createPostDto.prompt}" and "${tag.name}". For example, depict how "${createPostDto.prompt}" interacts with or is influenced by "${tag.name}". The image should creatively integrate both elements in a harmonious and meaningful way${stylePrompt}${colorPrompt}.`;
      }
    } else {
      createPostDto.prompt = `${createPostDto.prompt}${stylePrompt}${colorPrompt}`;
    }

    createPostDto.width = width;
    createPostDto.height = height;
  }

  async deletePost(
    postId: number,
    userId: number,
  ): Promise<{ message: string }> {
    const post = await this.postEntity.findOne({
      where: { id: postId, user: { id: userId } },
      relations: { contest: true },
    });

    if (!post) {
      throw new NotFoundException(
        'Post not found or you do not have permission to delete this post.',
      );
    }

    await this.postEntity.remove(post);
    if (post.contest.id) {
      await this.removeParticipant(post.contest.id, userId);
    }
    return { message: 'Post deleted successfully' };
  }

  async removeParticipant(contestId: number, participantId: number) {
    await this.contestRepository
      .createQueryBuilder()
      .relation(ContestEntity, 'participants')
      .of(contestId)
      .remove(participantId);
    return { message: 'Participant removed successfully' };
  }

  async getAllAISettings(): Promise<any> {
    const colors = await this.colorEntity.find();
    const styles = await this.styleEntity.find({
      select: { id: true, name: true, imageUrl: true },
    });

    const colorDetails = colors.map((color) => ({
      id: color.id,
      name: color.name,
    }));
    const styleDetails = styles.map((style) => ({
      id: style.id,
      name: style.name,
      imageUrl: style.imageUrl,
    }));

    const aiSettingsWithCost = Object.entries(this.aiSettings).map(
      ([key, value]) => {
        return {
          ...value,
          cost: this.getCostByService(key as AIEnum),
        };
      },
    );

    return {
      defaultSettings: this.defaultSettings,
      aiSettings: aiSettingsWithCost,
      colors: colorDetails,
      styles: styleDetails,
      aiDescription: this.aiDescription,
    };
  }

  getCostByService(service: AIEnum, quantity: number = 1): number {
    const pricing = {
      [AIEnum.AURA_FLOW]: 20,
      [AIEnum.FLUX]: 30,
      [AIEnum.REALISTIC_VISION]: 11,
      [AIEnum.FLUX_PRO_FINE_TUNE]: 100,
    };

    return pricing[service] * quantity || 0;
  }

  async markPostAsSaved(
    postId: number,
    userId: number,
  ): Promise<{ message: string }> {
    const post = await this.postEntity.findOne({
      where: { id: postId, user: { id: userId } },
    });
    if (!post) {
      throw new NotFoundException(
        'Post not found or you do not have permission to update this post.',
      );
    }
    post.is_saved = true;
    await this.postEntity.save(post);
    return { message: 'Post marked as saved successfully' };
  }

  calculateTotalCost(service: AIEnum, quantity: number): number {
    const costPerImage = this.getCostByService(service);
    return costPerImage * quantity;
  }

  async calculateRefundCredits(
    userId: number,
    posts: number[],
    aiService: AIEnum,
  ): Promise<{ success: boolean }> {
    const user = await this.userEntity.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    const foundPosts = await this.postEntity.find({
      where: {
        id: In(posts),
        user: { id: userId },
      },
    });

    if (foundPosts.length !== posts.length) {
      throw new BadRequestException(
        'Some posts not found or do not belong to user',
      );
    }

    const totalRefund = this.getCostByService(aiService, posts.length);
    user.points += totalRefund;
    await this.userEntity.save(user);
    return { success: true };
  }

  private async logActivityAndNotify(
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
