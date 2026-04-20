import {
  Injectable,
  HttpException,
  HttpStatus,
  BadRequestException,
  forwardRef,
  Inject,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadService } from 'src/upload/upload.service';
import { GenerateImageDto } from './dto/generate.image.dto';
import { EditImageDto } from './dto/edit-image.dto';
import { AIEnum } from 'src/common/enums/ai.enum';
import { PublicFineTunePresetEnum } from './dto/public-finetune-generate.dto';
import { PostEntity } from 'src/post/entities/post.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { TagEntity } from 'src/tag/entities/tag.entity';
import { StyleEntity } from 'src/post/entities/style.entity';
import { In, Repository } from 'typeorm';
import { getDimensionsForOrientation } from 'src/common/helpers/get.dimension.func';
import { ColorEntity } from './entities/color.entity';
import { AISettingsEntity } from './entities/ai-settings.entity';
import { AIProcessorMappingEntity, ProcessorType } from './entities/ai-processor-mapping.entity';
import { PostService } from 'src/post/post.service';
import { UserEntity } from 'src/user/entities/user.entity';
import { NotificationGateway } from 'src/notification/notification.gateway';
import { ActivityService } from 'src/activity/activity.service';
import { ActivityEnum } from 'src/activity/types/activity.enum';
import { UserService } from 'src/user/user.service';
import { SdxlStyles } from '@octoai/sdk/api/resources/imageGen';
import { ContestEntity } from 'src/contest/entity/contest.entity';
import { PartnershipActivityEntity } from 'src/admin/entities/partnership-activity.entity';
import { PartnerUserLinkEntity } from 'src/admin/entities/partner-user-link.entity';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { AiServiceToken } from 'src/service-token/entities/service-token.entity';
import { ServiceTokenService } from 'src/service-token/service-token.service';
import { TOKEN_POOL_KEYS } from 'src/service-token/constants/token-pool.constant';
import * as fal from '@fal-ai/serverless-client';
import OpenAI from 'openai';
import * as leoProfanity from 'leo-profanity';
import axios from 'axios';
import { wrapFetchWithPayment } from 'x402-fetch';
import { privateKeyToAccount } from 'viem/accounts';

@Injectable()
export class ImageGenerationService {
  private readonly logger = new Logger(ImageGenerationService.name);

  @InjectRepository(ContestEntity)
  private readonly contestRepository: Repository<ContestEntity>;
  private readonly defaultSettings: Record<string, any> = {
    defaultAI: 'flux',
    defaultStyle: 12,
    defaultSize: '1024x1024',
    defaultOrientations: 'vertical',
    defaultColor: 1,
  };
  private async getAISetting(aiService: string): Promise<AISettingsEntity | null> {
    return await this.aiSettingsRepository.findOne({
      where: { aiService: aiService, isActive: true, type: 'image' },
    });
  }
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
    @InjectRepository(PartnershipActivityEntity)
    private partnershipActivityRepo: Repository<PartnershipActivityEntity>,
    @InjectRepository(PartnerUserLinkEntity)
    private partnerUserLinkRepo: Repository<PartnerUserLinkEntity>,
    @InjectRepository(AISettingsEntity)
    private aiSettingsRepository: Repository<AISettingsEntity>,
    @InjectRepository(AIProcessorMappingEntity)
    private aiProcessorMappingRepository: Repository<AIProcessorMappingEntity>,
    @InjectQueue('fal_ai') private readonly falAiQueue: Queue,
    @InjectQueue('x_router') private readonly xRouterQueue: Queue,
  ) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  private logPrompt(
    stage: string,
    payload: Record<string, unknown>,
  ): void {
    this.logger.log(
      `[image-prompt] ${stage} | ${JSON.stringify(payload)}`,
    );
  }

  private logEditProvider(
    stage: string,
    payload: Record<string, unknown>,
  ): void {
    this.logger.log(
      `[image-edit-provider] ${stage} | ${JSON.stringify(payload)}`,
    );
  }

  private async selectTokenForImageGeneration(
    aiService: AIEnum,
    contestId?: number | null,
  ): Promise<AiServiceToken | null> {
    if (aiService === AIEnum.FLUX_PRO_FINE_TUNE && contestId) {
      return this.serviceTokenService.getNextAvailableTokenFromPool(
        TOKEN_POOL_KEYS.FAL_FINE_TUNE_CONTESTS,
        aiService,
      );
    }

    return this.serviceTokenService.getNextAvailableToken(aiService);
  }

  private async resolveEditAiService(
    aiService?: string,
  ): Promise<string> {
    if (!aiService) {
      const grokEditSetting = await this.getAISetting('grok_image_edit');
      if (grokEditSetting?.isArtem) {
        return grokEditSetting.aiService;
      }

      return AIEnum.BYTEDANCE_EDIT;
    }

    if (aiService === AIEnum.BYTEDANCE_EDIT) {
      return AIEnum.BYTEDANCE_EDIT;
    }

    const aiSetting = await this.getAISetting(aiService);
    if (!aiSetting || !aiSetting.isArtem) {
      throw new BadRequestException(
        `AI service ${aiService} is not available for image editing`,
      );
    }

    return aiSetting.aiService;
  }

  private getFalEditModel(aiService: string, aiSetting?: AISettingsEntity | null): string {
    if (aiService === AIEnum.BYTEDANCE_EDIT) {
      return 'fal-ai/bytedance/seededit/v3/edit-image';
    }

    return aiSetting?.apiModel || aiService;
  }

  private buildFalEditInput(
    aiService: string,
    editImageDto: EditImageDto,
  ): Record<string, unknown> {
    if (aiService === AIEnum.BYTEDANCE_EDIT) {
      return {
        image_url: editImageDto.image_url,
        prompt: editImageDto.prompt,
        guidance_scale: 0.5,
      };
    }

    if (aiService === 'grok_image_edit') {
      return {
        prompt: editImageDto.prompt,
        image_urls: [editImageDto.image_url],
        resolution: '2k',
        output_format: 'png',
        num_images: 1,
      };
    }

    return {
      prompt: editImageDto.prompt,
      image_url: editImageDto.image_url,
    };
  }

  async generateBytedanceEdit(editImageDto: EditImageDto): Promise<{
    generatedImages: string[];
    suggestedTags: { id: number; name: string }[];
  }> {
    return this.generateFalEdit(editImageDto, AIEnum.BYTEDANCE_EDIT);
  }

  async generateFalEdit(
    editImageDto: EditImageDto,
    aiService: string,
  ): Promise<{
    generatedImages: string[];
    suggestedTags: { id: number; name: string }[];
  }> {
    let token: AiServiceToken;
    let tag: TagEntity;
    try {
      console.log(
        `[generateFalEdit] Starting | Service: ${aiService} | Prompt: ${editImageDto.prompt.substring(0, 50)}...`,
      );
      this.logPrompt('edit-start', {
        service: aiService,
        contestId: editImageDto.contest_id ?? null,
        imageUrl: editImageDto.image_url,
        prompt: editImageDto.prompt,
      });
      const suggestedTags = [];
      
      
      const otherTag = await this.tagEntity.findOne({
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

      
      try {
        tag = await this.findBestTag(editImageDto.prompt);

        if (tag && tag.id !== otherTag.id) {
          suggestedTags.push({
            id: tag.id,
            name: '#' + tag.name,
            imageUrl: tag.imageUrl,
          });
        }
      } catch (aiError) {
        console.warn(
          'AI tag generation failed, using only "other" tag:',
          aiError.message,
        );
      }

      token = await this.serviceTokenService.getNextAvailableToken(aiService);

      if (!token) {
        throw new BadRequestException(
          'No tokens available for the selected AI service',
        );
      }
      fal.config({
        credentials: token.token,
      });

      this.logEditProvider('token-selected', {
        service: aiService,
        tokenId: token.id,
        tokenStatus: token.status,
        contestId: editImageDto.contest_id ?? null,
        imageUrl: editImageDto.image_url,
      });

      const aiSetting =
        aiService === AIEnum.BYTEDANCE_EDIT
          ? null
          : await this.getAISetting(aiService);
      const falModel = this.getFalEditModel(aiService, aiSetting);
      const generateMethod = fal.run.bind(fal, falModel);
      const inputParams = this.buildFalEditInput(aiService, editImageDto);

      this.logPrompt('edit-provider-input', {
        service: aiService,
        contestId: editImageDto.contest_id ?? null,
        prompt: editImageDto.prompt,
        imageUrl: editImageDto.image_url,
        falModel,
        inputParams,
      });

      this.logEditProvider('provider-call-start', {
        service: aiService,
        tokenId: token.id,
        endpoint: falModel,
      });
      
      const result = await generateMethod({
        input: inputParams,
      });

      this.logEditProvider('provider-call-success', {
        service: aiService,
        tokenId: token.id,
        resultKeys: Object.keys(result || {}),
        imageFieldType: Array.isArray(result?.image)
          ? 'array'
          : typeof result?.image,
        imagesFieldType: Array.isArray(result?.images)
          ? 'array'
          : typeof result?.images,
      });
      
  
      let imagesToProcess = [];
      if (Array.isArray(result?.images)) {
        imagesToProcess = result.images;
      } else if (Array.isArray(result?.image)) {
        imagesToProcess = result.image;
      } else if (
        result?.images &&
        typeof result.images === 'object' &&
        result.images.url
      ) {
        imagesToProcess = [result.images];
      } else if (
        result?.image &&
        typeof result.image === 'object' &&
        result.image.url
      ) {
        imagesToProcess = [result.image];
      } else {
        console.error('❌ Fal Edit Debug - Invalid result.image/result.images:', {
          service: aiService,
          image: result?.image,
          images: result?.images,
        });
        throw new Error(
          `Invalid result format: expected image/images object or array for ${aiService}`,
        );
      }
      
      if (!imagesToProcess || imagesToProcess.length === 0) {
        throw new Error(`${aiService} returned no images to process`);
      }
      
      const uploadPromises = imagesToProcess.map(async (image) => {
        const dataUrl = image.url;
        const uploadResponse = await this.uploadService.uploadByUrl(dataUrl);
        return uploadResponse;
      });

      const uploadResponses = await Promise.all(uploadPromises);

      console.log(
        `[generateFalEdit] Success | Service: ${aiService} | Generated: ${uploadResponses.length} images`,
      );
      this.logEditProvider('upload-success', {
        service: aiService,
        tokenId: token.id,
        generatedImages: uploadResponses.length,
      });
      return { generatedImages: uploadResponses, suggestedTags };
    } catch (error) {
      this.logger.error(
        `[image-edit-provider] provider-call-failed | ${JSON.stringify({
          service: aiService,
          tokenId: token?.id ?? null,
          contestId: editImageDto.contest_id ?? null,
          imageUrl: editImageDto.image_url,
          prompt: editImageDto.prompt,
          message: error.message,
          name: error.name,
          code: error.code,
          status: error.status,
          statusCode: error.statusCode,
          responseStatus: error.response?.status,
          responseStatusText: error.response?.statusText,
          responseData: error.response?.data ?? error.data ?? null,
          causeMessage: error.cause?.message ?? null,
        })}`,
        error.stack,
      );
      console.error(
        `[generateFalEdit] Failed | Service: ${aiService} | Error: ${error.message}`,
      );
      
      if (token?.token) {
        this.logEditProvider('token-rate-limit-mark-requested', {
          service: aiService,
          tokenId: token.id,
          reason: error.message,
          errorCode: error.code ?? null,
          errorStatus: error.status ?? error.statusCode ?? error.response?.status ?? null,
        });
        await this.serviceTokenService.markTokenAsRateLimited(
          token,
          aiService,
        );
      }

      throw new Error(`Failed to edit image with ${aiService}: ${error.message}`);
    }
  }

  async generateFalAi(createPostDto: GenerateImageDto): Promise<{
    generatedImages: string[];
    suggestedTags: { id: number; name: string }[];
  }> {
    let token: AiServiceToken;
    let tag: TagEntity;
    try {
      console.log(`[generateFalAi] Starting | Service: ${createPostDto.ai_service} | Quantity: ${createPostDto.image_quantity} | Prompt: ${createPostDto.prompt.substring(0, 50)}...`);
      this.logPrompt('generate-start', {
        service: createPostDto.ai_service,
        contestId: createPostDto.contest_id ?? null,
        quantity: createPostDto.image_quantity,
        orientation: createPostDto.orientation,
        prompt: createPostDto.prompt,
      });
      const suggestedTags = [];
      if (createPostDto.auto_tag_select) {
        tag = await this.findBestTag(createPostDto.prompt);
        if (tag) {
          suggestedTags.push({
            id: tag.id,
            name: '#' + tag.name,
            imageUrl: tag.imageUrl,
          });
        }
      } else {
        tag = await this.tagEntity.findOne({
          where: { id: createPostDto.tag_id },
        });
        if (!tag) {
          throw new BadRequestException(`Tag with id ${createPostDto.tag_id} not found`);
        }
        suggestedTags.push({
          id: tag.id,
          name: '#' + tag.name,
          imageUrl: tag.imageUrl,
        });
      }

      const otherTag = await this.tagEntity.findOne({
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

      token = await this.selectTokenForImageGeneration(
        createPostDto.ai_service,
        createPostDto.contest_id ?? null,
      );

      if (!token) {
        throw new BadRequestException(
          'No tokens available for the selected AI service',
        );
      }
      fal.config({
        credentials: token.token,
      });

      this.logger.log(
        `[fal-generate] token-selected | ${JSON.stringify({
          service: createPostDto.ai_service,
          tokenId: token.id,
          tokenStatus: token.status,
          tokenPoolKey: token.poolKey,
          contestId: createPostDto.contest_id ?? null,
        })}`,
      );

      if (createPostDto.ai_service === AIEnum.X_ROUTER) {
        throw new BadRequestException('X_ROUTER service should use generateXRouter method');
      }

      const aiSetting = await this.getAISetting(createPostDto.ai_service);
      
      if (!aiSetting || !aiSetting.apiModel) {
        throw new BadRequestException(`AI service ${createPostDto.ai_service} not found or apiModel not configured`);
      }

      const serviceName = aiSetting.apiModel;

      if (!serviceName) {
        throw new BadRequestException('Invalid AI service selected');
      }

      const generateMethod = fal.run.bind(fal, serviceName);

      // Get dimensions based on orientation
      const { width, height } = getDimensionsForOrientation(
        createPostDto.orientation,
        createPostDto.ai_service,
      );

      let inputParams: any = {
        prompt: createPostDto.prompt,
        numImages: createPostDto.image_quantity,
        aspect_ratio:
          width === 1024 && height === 1024
            ? '1:1'
            : width === 768 && height === 1344
              ? '3:4'
              : width === 1344 && height === 768
                ? '16:9'
                : undefined,
        negativePrompt: 'Blurry photo, distortion, low-res, poor quality',
        num_images: createPostDto.image_quantity,
      };

      if (AIEnum.FLUX_PRO_FINE_TUNE === createPostDto.ai_service) {
        if (!createPostDto.contest_id) {
          throw new BadRequestException(
            'contest_id is required for Flux Pro Fine Tune service',
          );
        }

        const contest = await this.contestRepository.findOne({
          where: { id: createPostDto.contest_id },
        });

        if (!contest) {
          throw new BadRequestException(
            `Contest with id ${createPostDto.contest_id} not found`,
          );
        }

        if (!contest.fineTuneToken) {
          throw new BadRequestException(
            `Contest ${createPostDto.contest_id} does not have fineTuneToken configured`,
          );
        }

        if (!contest.fineTuneTriggerWord) {
          console.warn(
            `[Flux Pro Fine Tune] Contest ${createPostDto.contest_id} missing fineTuneTriggerWord, using default`,
          );
        }

        // Flux Pro Fine Tune contest params prepared

        inputParams = {
          prompt: contest.fineTuneTriggerWord
            ? `Generate me ${contest.fineTuneTriggerWord}.${createPostDto.prompt}`
            : createPostDto.prompt,
          finetune_id: contest.fineTuneToken,
          output_format: 'jpeg',
          safety_tolerance: 2,
          num_images: createPostDto.image_quantity,
          guidance_scale: 15,
          num_inference_steps: 28,
          finetune_strength: +contest.fineTuneStrength || 1,
        };
      }

      this.logPrompt('generate-provider-input', {
        service: createPostDto.ai_service,
        apiModel: serviceName,
        contestId: createPostDto.contest_id ?? null,
        quantity: inputParams?.num_images ?? inputParams?.numImages,
        prompt: inputParams?.prompt,
      });

      // [FalAI] Calling ${serviceName} with params (omitted from logs in production)

      if (process.env.NODE_ENV === 'development') {
        const sentPrompt = (inputParams?.prompt ?? '').toString();
        console.log('[generateFalAi] fal.run input', {
          ai_service: createPostDto.ai_service,
          api_model: serviceName,
          promptPreview:
            sentPrompt.length > 200 ? `${sentPrompt.slice(0, 200)}…` : sentPrompt,
          promptLength: sentPrompt.length,
          num_images: inputParams?.num_images ?? inputParams?.numImages,
          aspect_ratio: inputParams?.aspect_ratio,
        });
      }

      const start = Date.now();
      const result = await generateMethod({
        input: inputParams,
      });
      this.logger.log(
        `[fal-generate] provider-call-success | ${JSON.stringify({
          service: createPostDto.ai_service,
          tokenId: token.id,
          durationMs: Date.now() - start,
          resultKeys: Object.keys(result || {}),
          imagesCount: Array.isArray(result?.images) ? result.images.length : null,
        })}`,
      );

      if (!result.images || !Array.isArray(result.images) || result.images.length === 0) {
        throw new Error(
          `FalAI service ${createPostDto.ai_service} returned no images. Result: ${JSON.stringify(result)}`,
        );
      }

      const end = Date.now();
      const uploadPromises = result.images.map(async (image) => {
        const dataUrl = image.url;

        const uploadResponse = await this.uploadService.uploadByUrl(dataUrl);

        return uploadResponse;
      });

      const uploadResponses = await Promise.all(uploadPromises);

      console.log(`[generateFalAi] Success | Service: ${createPostDto.ai_service} | Generated: ${uploadResponses.length} images`);
      return { generatedImages: uploadResponses, suggestedTags };
    } catch (error) {
      console.error(
        `[generateFalAi] Failed | Service: ${createPostDto.ai_service} | Error: ${error.message}`,
        {
          message: error.message,
          stack: error.stack,
          name: error.name,
          code: error.code,
          status: error.status,
          statusCode: error.statusCode,
          service: createPostDto.ai_service,
          contest_id: createPostDto.contest_id,
          token_id: token?.id,
          response_status: error.response?.status,
          response_data: error.response?.data,
          fullError: JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
        },
      );

      if (token?.token) {
        this.logger.warn(
          `[fal-generate] token-rate-limit-mark-requested | ${JSON.stringify({
            service: createPostDto.ai_service,
            tokenId: token.id,
            reason: error.message,
            errorCode: error.code ?? null,
            errorStatus: error.status ?? error.statusCode ?? error.response?.status ?? null,
          })}`,
        );
        await this.serviceTokenService.markTokenAsRateLimited(
          token,
          createPostDto.ai_service,
        );
      }

      const status = error.status || error.statusCode || error.response?.status;
      const statusText = error.response?.statusText || error.message;
      const errorData = error.response?.data || error.data;

      if (status === 403 || error.message?.includes('Forbidden')) {
        throw new Error(
          `Forbidden: ${statusText}. Check API key permissions and fine-tune model access. ${errorData ? JSON.stringify(errorData) : ''}`,
        );
      } else if (status === 422 || error.message?.includes('Unprocessable Entity')) {
        throw new Error(
          `Unprocessable Entity: ${statusText}. Invalid parameters. ${errorData ? JSON.stringify(errorData) : ''}`,
        );
      } else if (status) {
        throw new Error(
          `API Error (${status}): ${statusText}. ${errorData ? JSON.stringify(errorData) : ''}`,
        );
      }

      throw new Error(`Failed to generate images: ${error.message}`);
    }
  }

  /**
   * Public fine-tune generation:
   * - no auth (controller-level)
   * - no user / no credits charging
   * - no DB writes
   * - always uses fixed fine-tune token
   */
  async generateFineTuneImagesPublic(
    prompt: string,
    imageQuantity: number,
    preset: PublicFineTunePresetEnum = PublicFineTunePresetEnum.XOOB,
  ): Promise<{ images: string[]; fineTuneToken: string; providerModel: string }> {
    const fineTuneTokenByPreset: Record<PublicFineTunePresetEnum, string> = {
      [PublicFineTunePresetEnum.XOOB]:
        'fca9b669-380a-4d5e-873b-ac0b116c82a0',
      [PublicFineTunePresetEnum.NOMISMA]:
        '62a50ee2-5e66-4fe2-ad6b-64cead6834e8',
    };
    const fineTuneToken = fineTuneTokenByPreset[preset] ?? fineTuneTokenByPreset[PublicFineTunePresetEnum.XOOB];
    let token: AiServiceToken;

    try {
      const trimmedPrompt = (prompt || '').trim();
      if (!trimmedPrompt) {
        throw new BadRequestException('prompt is required');
      }

      const aiSetting = await this.getAISetting(AIEnum.FLUX_PRO_FINE_TUNE);
      if (!aiSetting || !aiSetting.apiModel) {
        throw new BadRequestException(
          `AI service ${AIEnum.FLUX_PRO_FINE_TUNE} not found or apiModel not configured`,
        );
      }

      if (trimmedPrompt.length > aiSetting.maxPromptLength) {
        throw new BadRequestException(
          `Prompt length must not exceed ${aiSetting.maxPromptLength} characters for ${aiSetting.name}`,
        );
      }

      if (imageQuantity < aiSetting.minImages || imageQuantity > aiSetting.maxImages) {
        throw new BadRequestException(
          `imageQuantity must be between ${aiSetting.minImages} and ${aiSetting.maxImages} for ${aiSetting.name}`,
        );
      }

      token = await this.serviceTokenService.getNextAvailableToken(
        AIEnum.FLUX_PRO_FINE_TUNE,
      );
      if (!token) {
        throw new BadRequestException(
          'No tokens available for the selected AI service',
        );
      }

      fal.config({ credentials: token.token });

      const generateMethod = fal.run.bind(fal, aiSetting.apiModel);
      const inputParams: any = {
        prompt: trimmedPrompt,
        finetune_id: fineTuneToken,
        output_format: 'jpeg',
        safety_tolerance: 2,
        num_images: imageQuantity,
        guidance_scale: 15,
        num_inference_steps: 28,
        finetune_strength: 1,
      };

      const result = await generateMethod({ input: inputParams });

      if (!result?.images || !Array.isArray(result.images) || result.images.length === 0) {
        throw new Error(
          `FalAI service returned no images. Result: ${JSON.stringify(result)}`,
        );
      }

      const uploadResponses = await Promise.all(
        result.images.map(async (image) => {
          if (!image?.url) {
            throw new Error('FalAI returned an image without url');
          }
          return await this.uploadService.uploadByUrl(image.url);
        }),
      );

      return {
        images: uploadResponses,
        fineTuneToken,
        providerModel: aiSetting.apiModel,
      };
    } catch (error) {
      if (token?.token) {
        try {
          await this.serviceTokenService.markTokenAsRateLimited(
            token,
            AIEnum.FLUX_PRO_FINE_TUNE,
          );
        } catch {
          // ignore secondary failures
        }
      }
      throw error;
    }
  }

  async generateXRouter(createPostDto: GenerateImageDto): Promise<{
    generatedImages: string[];
    suggestedTags: { id: number; name: string }[];
  }> {
    let tag: TagEntity;
    try {
      console.log(`[generateXRouter] Starting | Quantity: ${createPostDto.image_quantity} | Prompt: ${createPostDto.prompt.substring(0, 50)}...`);
      this.logPrompt('x-router-start', {
        service: createPostDto.ai_service,
        contestId: createPostDto.contest_id ?? null,
        quantity: createPostDto.image_quantity,
        orientation: createPostDto.orientation,
        prompt: createPostDto.prompt,
      });
      const suggestedTags = [];
      
      if (createPostDto.auto_tag_select) {
        tag = await this.findBestTag(createPostDto.prompt);
        if (tag) {
          suggestedTags.push({
            id: tag.id,
            name: '#' + tag.name,
            imageUrl: tag.imageUrl,
          });
        }
      } else {
        tag = await this.tagEntity.findOne({
          where: { id: createPostDto.tag_id },
        });
        if (!tag) {
          throw new BadRequestException(`Tag with id ${createPostDto.tag_id} not found`);
        }
        suggestedTags.push({
          id: tag.id,
          name: '#' + tag.name,
          imageUrl: tag.imageUrl,
        });
      }

      const otherTag = await this.tagEntity.findOne({
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

      const privateKey = this.configService.get<string>('X_ROUTER_PRIVATE_KEY');
      if (!privateKey) {
        throw new BadRequestException('X-Router private key is not configured');
      }

      const account = privateKeyToAccount(privateKey as `0x${string}`);
      
      const fetchWithPayment = wrapFetchWithPayment(globalThis.fetch, account);

      // URL API x-router
      const xRouterApiUrl = this.configService.get<string>('X_ROUTER_API_URL') || 
        'https://api.x-router.ai/v1/images/generate';
      
      const model = this.configService.get<string>('X_ROUTER_MODEL') || 'flux-schnell';

      // Get dimensions based on orientation
      const { width, height } = getDimensionsForOrientation(
        createPostDto.orientation,
        createPostDto.ai_service,
      );

      const requestBody: any = {
        prompt: createPostDto.prompt,
        model: model,
        width: width,
        height: height,
        numberResults: Math.min(createPostDto.image_quantity, 4),
        negativePrompt: 'blurry, distorted, low quality, bad anatomy, ugly, watermark',
      };

      this.logPrompt('x-router-provider-input', {
        service: createPostDto.ai_service,
        model,
        quantity: requestBody.numberResults,
        prompt: requestBody.prompt,
        negativePrompt: requestBody.negativePrompt,
      });


      // [X-Router] Generating images with params (omitted from logs in production)

      const response = await fetchWithPayment(xRouterApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[X-Router] API error:`, {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new BadRequestException(
          `X-Router API error: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const data = await response.json();

      const paymentResponseHeader = response.headers.get('x-payment-response');
      if (paymentResponseHeader) {
        try {
          const paymentData = JSON.parse(
            Buffer.from(paymentResponseHeader, 'base64').toString('utf-8'),
          );
          // Keep paymentData only for potential future structured logging; avoid console.log noise
        } catch (e) {
          console.warn(`[X-Router] Failed to parse payment response header:`, e);
        }
      }

      if (!data.images || !Array.isArray(data.images) || data.images.length === 0) {
        throw new BadRequestException('No images returned from X-Router API');
      }

      const uploadPromises = data.images.map(async (image: { url: string; uuid: string }) => {
        try {
          const uploadResponse = await this.uploadService.uploadByUrl(image.url);
          return uploadResponse;
        } catch (error) {
          console.error(`[X-Router] Failed to upload image ${image.uuid}:`, error);
          throw error;
        }
      });

      const uploadResponses = await Promise.all(uploadPromises);

      console.log(`[generateXRouter] Success | Generated: ${uploadResponses.length} images`);
      return { generatedImages: uploadResponses, suggestedTags };
    } catch (error) {
      console.error(`[generateXRouter] Failed | Error: ${error.message}`);
      throw new Error(`Failed to generate images via x-router: ${error.message}`);
    }
  }

  async editImage(editImageDto: EditImageDto, userId: number) {
    const resolvedAiService = await this.resolveEditAiService(
      editImageDto.ai_service,
    );
    editImageDto.ai_service = resolvedAiService;

    const user = await this.getUser(userId);

    await this.verifyUserHasEnoughCredits(user, {
      ai_service: resolvedAiService,
      image_quantity: 1,
    } as any);
    await this.ensureUserCanParticipateInContest(
      user.id,
      editImageDto.contest_id ?? null,
    );

    return await this.editImageUsingService(editImageDto, userId);
  }

  async generateImages(createPostDto: GenerateImageDto, userId: number) {
    try {
      const originalPrompt = createPostDto.prompt;
      const user = await this.getUser(userId);
      await this.verifyUserHasEnoughCredits(user, createPostDto);

      await this.ensureUserCanParticipateInContest(
        user.id,
        createPostDto.contest_id,
      );

      const { style, color } = await this.fetchAndValidateEntities(createPostDto);

      await this.prepareDtoForGeneration(createPostDto, style, color);

      this.logPrompt('generate-prepared', {
        userId,
        service: createPostDto.ai_service,
        contestId: createPostDto.contest_id ?? null,
        originalPrompt,
        preparedPrompt: createPostDto.prompt,
        styleId: createPostDto.style_id ?? null,
        styleName: style?.name ?? null,
        colorId: createPostDto.color_id ?? null,
        colorName: color?.name ?? null,
        tagId: createPostDto.tag_id ?? null,
        autoTagSelect: createPostDto.auto_tag_select,
      });

      return await this.generateImagesUsingService(createPostDto, userId);
    } catch (error) {
      console.error(`[generateImages] Error:`, {
        userId,
        aiService: createPostDto.ai_service,
        prompt: createPostDto.prompt,
        error: error.message
      });
      throw error;
    }
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
      return tags[0];
    }

    let tagId = parsedResponse?.tag_id;

    if (!tagId || isNaN(tagId)) {
      tagId = tags[0]?.id || null;
    }

    const bestTag = tags.find((tag) => tag.id === tagId);

    if (!bestTag) {
      return tags[0];
    }

    return bestTag;
  }

  private async verifyUserHasEnoughCredits(
    user: UserEntity,
    createPostDto: GenerateImageDto,
  ) {
    const totalCost = await this.calculateTotalCost(
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
    await this.validateEntities(tag, style, color, createPostDto);
    return { style, color };
  }

  async editImageUsingService(
    editImageDto: EditImageDto,
    userId: number,
  ): Promise<any> {
    try {
      const aiService = editImageDto.ai_service || AIEnum.BYTEDANCE_EDIT;
      const mapping = await this.getProcessorMapping(aiService, true);
      const queue = this.getQueueByProcessorType(mapping.processorType);
      
      const jobOptions = {
        attempts: 3,
        backoff: 15000,
        removeOnComplete: true,
        removeOnFail: false,
      };

      return await this.addJobToQueue(
        queue,
        aiService,
        editImageDto,
        userId,
        jobOptions,
        mapping,
      );
    } catch (error) {
      throw new Error(`Failed to add edit image job to queue: ${error.message}`);
    }
  }

  async generateImagesUsingService(
    createPostDto: GenerateImageDto,
    userId: number,
  ): Promise<any> {
    try {
      const mapping = await this.getProcessorMapping(createPostDto.ai_service);
      const queue = this.getQueueByProcessorType(mapping.processorType);
      
      const jobOptions = {
        attempts: 3,
        backoff: 15000,
        removeOnComplete: true,
        removeOnFail: false,
      };

      return await this.addJobToQueue(
        queue,
        createPostDto.ai_service,
        createPostDto,
        userId,
        jobOptions,
        mapping,
      );
    } catch (error) {
      console.error(`[generateImagesUsingService] Error:`, {
        userId,
        aiService: createPostDto.ai_service,
        prompt: createPostDto.prompt,
        error: error.message
      });
      throw error;
    }
  }

  private async getProcessorMapping(
    aiService: string,
    isEdit = false,
  ): Promise<AIProcessorMappingEntity> {
    const mapping = await this.aiProcessorMappingRepository.findOne({
      where: { aiService: aiService },
    });

    if (!mapping) {
      if (isEdit) {
        return this.aiProcessorMappingRepository.create({
          aiService,
          processorType: ProcessorType.FAL_AI,
          queueName: ProcessorType.FAL_AI,
          concurrency: 60,
          lockDuration: 120000,
          isEdit: true,
          completedNotificationParam: true,
        });
      }

      throw new HttpException(
        `Processor mapping not found for AI service: ${aiService}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    return mapping;
  }

  private getQueueByProcessorType(processorType: ProcessorType): Queue {
    switch (processorType) {
      case ProcessorType.FAL_AI:
        return this.falAiQueue;
      case ProcessorType.X_ROUTER:
        return this.xRouterQueue;
      default:
        throw new HttpException(
          `Unsupported processor type: ${processorType}`,
          HttpStatus.BAD_REQUEST,
        );
    }
  }

  private async addJobToQueue(
    queue: any,
    aiService: string,
    dto: any,
    userId: number,
    jobOptions: any,
    mapping: AIProcessorMappingEntity,
  ): Promise<any> {
    try {
      const jobData = mapping.isEdit
        ? {
            editImageDto: dto,
            userId,
            aiService,
          }
        : {
            createPostDto: dto,
            userId,
            aiService,
          };

      return await queue.add(aiService, jobData, jobOptions);
    } catch (error) {
      console.error(`[addJobToQueue] Error:`, {
        aiService,
        userId,
        error: error.message,
      });
      throw error;
    }
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
    dto: GenerateImageDto | EditImageDto,
    user: UserEntity,
    service: string,
    suggestedTags?: { id: number; name: string }[],
  ) {
    if (!generatedImages || !Array.isArray(generatedImages) || generatedImages.length === 0) {
      throw new Error(
        `Cannot save empty generated images array for service ${service}. User: ${user.id}`,
      );
    }

    const posts: PostEntity[] = await Promise.all(
      generatedImages.map(async (imageUrl): Promise<PostEntity> => {
        if ('image_url' in dto) {
          return await this.createPostForEditImage(dto as EditImageDto, imageUrl, user, suggestedTags);
        } else {
          return await this.createPostForImage(dto as GenerateImageDto, imageUrl, user, suggestedTags);
        }
      }),
    );

    const generationCost = await this.getCostByService(
      service,
      'image_url' in dto ? 1 : (dto as GenerateImageDto).image_quantity,
    );

    await this.logActivityAndNotify(
      user.id,
      ActivityEnum.IMAGE_GENERATE_SPEND,
      service,
      generationCost,
    );

    // Log partnership activity 'image_generated'
    try {
      if (user.id) {
        const links = await this.partnerUserLinkRepo.find({
          where: { userId: user.id },
        });
        for (const link of links) {
          const exists = await this.partnershipActivityRepo.findOne({
            where: {
              partnershipId: link.partnershipId,
              userId: user.id,
              activity: 'image_generated',
            },
          });
          if (exists) {
            continue;
          }
          const rec = this.partnershipActivityRepo.create({
            partnershipId: link.partnershipId,
            userId: user.id,
            activity: 'image_generated',
          });
          await this.partnershipActivityRepo.save(rec);
        }
      }
    } catch (error) {
      console.error(
        '[saveGeneratedImages] Failed to log partnership activity image_generated:',
        error?.stack || error,
      );
    }

    const contestId =
      'contest_id' in dto && dto.contest_id ? dto.contest_id : null;
    let publishTo = { postToTwitter: false, postToInstagram: false };
    if (contestId) {
      const contest = await this.contestRepository.findOne({
        where: { id: contestId },
        select: ['socialPostSettings'],
      });
      if (contest?.socialPostSettings) {
        publishTo = {
          postToTwitter: contest.socialPostSettings.postToTwitter ?? false,
          postToInstagram: contest.socialPostSettings.postToInstagram ?? false,
        };
      }
    }

    return posts.map((post: PostEntity) => ({
      id: post.id,
      imageUrl: post.imageUrl,
      videoUrl: post.videoUrl,
      previewImageUrl: post.previewImageUrl,
      generationParams: post.generationParams,
      publishTo,
    }));
  }
  private async createPostForEditImage(
    editImageDto: EditImageDto,
    imageUrl: string,
    user: UserEntity,
    suggestedTags?: { id: number; name: string }[],
  ) {
    
    const tempDto = {
      prompt: editImageDto.prompt,
      ai_service: editImageDto.ai_service || AIEnum.BYTEDANCE_EDIT,
      orientation: 'horizontal' as const,
      image_quantity: 1,
      auto_tag_select: true,
    } as any;
    
    return await this.postService.savePost(
      tempDto,
      imageUrl,
      user.id,
      editImageDto.contest_id ?? null,
      suggestedTags,
    );
  }

  private async createPostForImage(
    createPostDto: GenerateImageDto,
    imageUrl: string,
    user: UserEntity,
    suggestedTags?: { id: number; name: string }[],
  ) {
    return await this.postService.savePost(
      createPostDto,
      imageUrl,
      user.id,
      createPostDto.contest_id || null,
      suggestedTags,
    );
  }

  async updateUserCredits(user: UserEntity, dto: GenerateImageDto | EditImageDto) {
    let cost: number;
    
    if ('ai_service' in dto && 'image_quantity' in dto) {
      
      cost = await this.calculateTotalCost(
        dto.ai_service,
        dto.image_quantity,
      );
    } else {
      
      cost = await this.calculateTotalCost(
        dto.ai_service || AIEnum.BYTEDANCE_EDIT,
        1,
      );
    }
    
    user.points -= cost;
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

  private async validateEntities(
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

    const aiSetting = await this.getAISetting(createPostDto.ai_service);
    if (!aiSetting) {
      throw new BadRequestException(`AI service ${createPostDto.ai_service} not found or inactive`);
    }

    if (createPostDto.image_quantity < aiSetting.minImages || createPostDto.image_quantity > aiSetting.maxImages) {
      throw new BadRequestException(
        `Image quantity must be between ${aiSetting.minImages} and ${aiSetting.maxImages} for ${aiSetting.name}`,
      );
    }

    if (createPostDto.prompt.length > aiSetting.maxPromptLength) {
      throw new BadRequestException(
        `Prompt length must not exceed ${aiSetting.maxPromptLength} characters for ${aiSetting.name}`,
      );
    }

    if (!aiSetting.allowedOrientations.includes(createPostDto.orientation)) {
      throw new BadRequestException(
        `Orientation ${createPostDto.orientation} is not allowed for ${aiSetting.name}. Allowed: ${aiSetting.allowedOrientations.join(', ')}`,
      );
    }
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
    const originalPrompt = createPostDto.prompt;
    createPostDto.prompt = this.sanitizePrompt(createPostDto.prompt);
    const sanitizedPrompt = createPostDto.prompt;
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

    this.logPrompt('prepare-dto', {
      service: createPostDto.ai_service,
      orientation: createPostDto.orientation,
      width,
      height,
      originalPrompt,
      sanitizedPrompt,
      finalPrompt: createPostDto.prompt,
      styleId: createPostDto.style_id ?? null,
      styleName: style?.name ?? null,
      colorId: createPostDto.color_id ?? null,
      colorName: color?.name ?? null,
      tagId: createPostDto.tag_id ?? null,
      autoTagSelect: createPostDto.auto_tag_select,
    });
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
    if (post?.contest?.id) {
      await this.removeParticipant(post.contest.id, userId);
    }
    await this.postEntity.remove(post);

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

    const aiSettingsFromDb = await this.aiSettingsRepository.find({
      where: { isActive: true, type: 'image' },
      order: { id: 'ASC' },
    });

    const aiSettingsWithCost = await Promise.all(
      aiSettingsFromDb.map(async (setting) => {
        return {
          id: setting.aiService,
          aiService: setting.aiService,
          name: setting.name,
          allowedOrientations: setting.allowedOrientations,
          minImages: setting.minImages,
          maxImages: setting.maxImages,
          maxPromptLength: setting.maxPromptLength,
          sizes: setting.sizes || [],
          qualityOptions: setting.qualityOptions || [],
          styles: setting.styles || [],
          isArtem: setting.isArtem,
          cost: setting.cost,
          description: setting.description,
          modelType: setting.isArtem ? 'IMAGE_EDITING' : 'TEXT_TO_IMAGE',
        };
      }),
    );

    const aiDescription = aiSettingsFromDb
      .filter((s) => s.description)
      .map((setting) => `${setting.name}: ${setting.description}`);

    return {
      defaultSettings: this.defaultSettings,
      aiSettings: aiSettingsWithCost,
      colors: colorDetails,
      styles: styleDetails,
      aiDescription: aiDescription,
    };
  }

  async getCostByService(service: string, quantity: number = 1): Promise<number> {
    const aiSetting = await this.aiSettingsRepository.findOne({
      where: { aiService: service, isActive: true, type: 'image' },
    });

    if (!aiSetting) {
      return 0;
    }

    return aiSetting.cost * quantity;
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
    post.isSaved = true;
    await this.postEntity.save(post);
    return { message: 'Post marked as saved successfully' };
  }

  async calculateTotalCost(service: string, quantity: number): Promise<number> {
    const costPerImage = await this.getCostByService(service);
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

    const totalRefund = await this.getCostByService(aiService, posts.length);
    user.points += totalRefund;
    await this.userEntity.save(user);
    await this.notificationGateway.emitProfileUpdate(user.id.toString());
    return { success: true };
  }

  private async logActivityAndNotify(
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
      service,
      generationCost,
    });
    await this.notificationGateway.sendNotification(
      userId.toString(),
      description,
      activityType,
    );
  }
}
