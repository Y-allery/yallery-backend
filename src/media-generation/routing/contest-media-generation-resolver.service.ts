import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ContestEntity } from 'src/contest/entity/contest.entity';
import { ContestTypeEnum } from 'src/contest/types/contest.status.enum';
import { Repository } from 'typeorm';
import {
  PromptImageGenerationRequest,
  ResolvedPromptImageGenerationRequest,
} from '../contracts/prompt-image-generation-request.contract';
import { MediaAISettingsEntity } from '../entities/media-ai-settings.entity';
import {
  getPromptImageDimensions,
  resolvePromptImageOrientation,
} from '../presets';

@Injectable()
export class ContestMediaGenerationResolverService {
  constructor(
    @InjectRepository(ContestEntity)
    private readonly contestRepository: Repository<ContestEntity>,
    @InjectRepository(MediaAISettingsEntity)
    private readonly mediaAISettingsRepository: Repository<MediaAISettingsEntity>,
  ) {}

  async resolvePromptImageRequest(
    request: PromptImageGenerationRequest,
  ): Promise<ResolvedPromptImageGenerationRequest> {
    if (!request.contestId) {
      return this.resolveRegularPromptImageRequest(request);
    }

    const contest = await this.getContestWithMediaAiSetting(request.contestId);
    const mediaAiSetting = await this.resolveContestMediaAiSetting(
      contest,
      'image_generate',
    );
    const aiService = mediaAiSetting.aiService;
    const orientation = resolvePromptImageOrientation(aiService, request.orientation);
    const { width, height } = getPromptImageDimensions(aiService, orientation);

    this.assertPromptImageQuantity(aiService, request.imageQuantity);

    if (contest.contestType !== ContestTypeEnum.FINE_TUNE) {
      if (aiService === 'flux_fine_tune') {
        throw new BadRequestException(
          `Contest ${contest.id} is linked to flux_fine_tune but is not marked as a fine-tune contest.`,
        );
      }

      return {
        ...request,
        aiService,
        orientation,
        width,
        height,
      };
    }

    if (aiService !== 'flux_fine_tune') {
      throw new BadRequestException(
        `Contest ${contest.id} is marked as fine-tune but is linked to ${aiService}.`,
      );
    }

    if (!contest.fineTuneToken) {
      throw new BadRequestException(
        `Contest ${contest.id} does not have fineTuneToken configured.`,
      );
    }

    const basePrompt = request.resolvedPrompt ?? request.prompt;

    return {
      ...request,
      aiService,
      orientation,
      width,
      height,
      resolvedPrompt: contest.fineTuneTriggerWord
        ? `Generate me ${contest.fineTuneTriggerWord}. ${basePrompt}`
        : basePrompt,
      providerSettings: {
        finetuneId: contest.fineTuneToken,
        finetuneStrength: Number(contest.fineTuneStrength) || 1,
        contestType: contest.contestType,
      },
    };
  }

  async assertContestCapability(
    contestId: number,
    expectedCapability: string,
  ): Promise<ContestEntity> {
    const contest = await this.getContestWithMediaAiSetting(contestId);
    await this.resolveContestMediaAiSetting(contest, expectedCapability);
    return contest;
  }

  private resolveRegularPromptImageRequest(
    request: PromptImageGenerationRequest,
  ): ResolvedPromptImageGenerationRequest {
    if (!request.aiService?.trim()) {
      throw new BadRequestException(
        'ai_service is required when contest_id is not provided.',
      );
    }

    const aiService = request.aiService.trim();
    const orientation = resolvePromptImageOrientation(aiService, request.orientation);
    const { width, height } = getPromptImageDimensions(aiService, orientation);

    this.assertPromptImageQuantity(aiService, request.imageQuantity);

    return {
      ...request,
      aiService,
      orientation,
      width,
      height,
    };
  }

  private async getContestWithMediaAiSetting(
    contestId: number,
  ): Promise<ContestEntity> {
    const contest = await this.contestRepository.findOne({
      where: { id: contestId },
      relations: {
        mediaAiSetting: true,
      },
    });

    if (!contest) {
      throw new NotFoundException('Contest not found');
    }

    return contest;
  }

  private async resolveContestMediaAiSetting(
    contest: ContestEntity,
    expectedCapability: string,
  ): Promise<MediaAISettingsEntity> {
    const mediaAiSetting =
      contest.mediaAiSetting ??
      (await this.resolveFallbackContestMediaAiSetting(contest, expectedCapability));

    if (!mediaAiSetting.isActive) {
      throw new BadRequestException(
        `Contest ${contest.id} is linked to inactive model ${mediaAiSetting.aiService}.`,
      );
    }

    if (mediaAiSetting.capability !== expectedCapability) {
      throw new BadRequestException(
        `Contest ${contest.id} is configured for ${mediaAiSetting.capability}, not ${expectedCapability}.`,
      );
    }

    return mediaAiSetting;
  }

  private async resolveFallbackContestMediaAiSetting(
    contest: ContestEntity,
    expectedCapability: string,
  ): Promise<MediaAISettingsEntity> {
    if (expectedCapability !== 'image_generate') {
      throw new BadRequestException(
        `Contest ${contest.id} does not support ${expectedCapability}.`,
      );
    }

    if (contest.contestType === ContestTypeEnum.FINE_TUNE) {
      return this.getMediaAiSettingByAiService('flux_fine_tune', expectedCapability);
    }

    return this.getDefaultPromptImageContestSetting();
  }

  private async getMediaAiSettingByAiService(
    aiService: string,
    capability: string,
  ): Promise<MediaAISettingsEntity> {
    const mediaAiSetting = await this.mediaAISettingsRepository.findOne({
      where: {
        aiService,
        capability,
        isActive: true,
      },
    });

    if (!mediaAiSetting) {
      throw new BadRequestException(
        `Media AI setting ${aiService} (${capability}) is not configured.`,
      );
    }

    return mediaAiSetting;
  }

  private async getDefaultPromptImageContestSetting(): Promise<MediaAISettingsEntity> {
    const preferredSetting = await this.mediaAISettingsRepository.findOne({
      where: {
        aiService: 'nano_banana',
        capability: 'image_generate',
        isActive: true,
      },
    });

    if (preferredSetting) {
      return preferredSetting;
    }

    const settings = await this.mediaAISettingsRepository.find({
      where: {
        capability: 'image_generate',
        isActive: true,
      },
      order: {
        id: 'ASC',
      },
    });

    const fallbackSetting = settings.find(
      (setting) => setting.aiService !== 'flux_fine_tune',
    );

    if (!fallbackSetting) {
      throw new BadRequestException(
        'No active prompt-image model is configured for contests.',
      );
    }

    return fallbackSetting;
  }

  private assertPromptImageQuantity(aiService: string, imageQuantity: number) {
    if (['nano_banana', 'flux_schnell'].includes(aiService) && imageQuantity !== 1) {
      throw new BadRequestException(
        `Model ${aiService} currently supports only image_quantity=1.`,
      );
    }
  }
}
