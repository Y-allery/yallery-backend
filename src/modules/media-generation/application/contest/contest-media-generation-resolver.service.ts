import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ContestEntity } from 'src/modules/contests/entity/contest.entity';
import { ContestTypeEnum } from 'src/modules/contests/types/contest.status.enum';
import { AIFinetuneEntity } from 'src/modules/admin/entities/ai-finetune.entity';
import { ContestFlowMetadataEntity } from 'src/modules/contests/entity/contest-flow-metadata.entity';
import { Repository } from 'typeorm';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';
import {
  PromptImageGenerationRequest,
  ResolvedPromptImageGenerationRequest,
} from 'src/modules/media-generation/domain/contracts/prompt-image-generation-request.contract';
import { MediaAISettingsEntity } from 'src/modules/media-generation/persistence/entities/media-ai-settings.entity';
import {
  getPromptImageDimensions,
  resolvePromptImageOrientation,
} from 'src/modules/media-generation/domain/presets';

@Injectable()
export class ContestMediaGenerationResolverService {
  /** Fallback when DEFAULT_PROMPT_IMAGE_CONTEST_AI_SERVICE is not configured. */
  private readonly defaultPromptImageContestAiService = 'sdxl';

  constructor(
    @InjectRepository(ContestEntity)
    private readonly contestRepository: Repository<ContestEntity>,
    @InjectRepository(MediaAISettingsEntity)
    private readonly mediaAISettingsRepository: Repository<MediaAISettingsEntity>,
    @InjectRepository(AIFinetuneEntity)
    private readonly aiFinetuneRepository: Repository<AIFinetuneEntity>,
    @InjectRepository(ContestFlowMetadataEntity)
    private readonly contestFlowMetadataRepository: Repository<ContestFlowMetadataEntity>,
    private readonly providerRuntimeConfigService: ProviderRuntimeConfigService,
  ) {}

  async resolvePromptImageRequest(
    request: PromptImageGenerationRequest,
  ): Promise<ResolvedPromptImageGenerationRequest> {
    if (!request.contestId) {
      return this.resolveRegularPromptImageRequest(request);
    }

    const contest = await this.getContestWithMediaAiSetting(request.contestId);
    const isV2Contest = await this.isV2Contest(contest.id);

    if (isV2Contest && contest.contestType !== ContestTypeEnum.FINE_TUNE) {
      return this.resolveRegularPromptImageRequest(request);
    }

    this.assertFineTuneContestPromptModel(contest, request.aiService);

    const mediaAiSetting = await this.resolveContestMediaAiSetting(
      contest,
      'image_generate',
    );
    const aiService = mediaAiSetting.aiService;
    const orientation = resolvePromptImageOrientation(
      aiService,
      request.orientation,
    );
    const { width, height } = getPromptImageDimensions(aiService, orientation);

    if (contest.contestType !== ContestTypeEnum.FINE_TUNE) {
      if (aiService === 'sdxl_lora_generation') {
        throw new BadRequestException(
          `Contest ${contest.id} is linked to ${aiService} but is not marked as a fine-tune contest.`,
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

    if (aiService !== 'sdxl_lora_generation') {
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

    const fineTune = await this.getReadyFineTuneByLoraKey(
      contest.fineTuneToken,
    );
    const triggerWord = contest.fineTuneTriggerWord || fineTune.triggerWord;
    const loraScale =
      Number(contest.fineTuneStrength) ||
      fineTune.generationDefaults?.loraScale ||
      0.8;

    return {
      ...request,
      aiService,
      orientation,
      width,
      height,
      resolvedPrompt: basePrompt,
      providerSettings: {
        loraKey: fineTune.loraKey,
        loraScale,
        loraUrl: fineTune.loraUrl,
        triggerWord,
        contestType: contest.contestType,
      },
    };
  }

  async assertContestCapability(
    contestId: number,
    expectedCapability: string,
  ): Promise<ContestEntity> {
    const contest = await this.getContestWithMediaAiSetting(contestId);
    if (await this.isV2Contest(contest.id)) {
      return contest;
    }
    await this.resolveContestMediaAiSetting(contest, expectedCapability);
    return contest;
  }

  private async isV2Contest(contestId: number): Promise<boolean> {
    return (
      (await this.contestFlowMetadataRepository.count({
        where: { contestId },
      })) > 0
    );
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
    const orientation = resolvePromptImageOrientation(
      aiService,
      request.orientation,
    );
    const { width, height } = getPromptImageDimensions(aiService, orientation);

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
      (await this.resolveFallbackContestMediaAiSetting(
        contest,
        expectedCapability,
      ));

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
      return this.getMediaAiSettingByAiService(
        'sdxl_lora_generation',
        expectedCapability,
      );
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
    const configured =
      (await this.providerRuntimeConfigService.getString(
        'DEFAULT_PROMPT_IMAGE_CONTEST_AI_SERVICE',
      )) || this.defaultPromptImageContestAiService;

    for (const aiService of [
      configured,
      this.defaultPromptImageContestAiService,
    ]) {
      const preferredSetting = await this.mediaAISettingsRepository.findOne({
        where: {
          aiService,
          capability: 'image_generate',
          isActive: true,
        },
      });
      if (preferredSetting) {
        return preferredSetting;
      }
    }

    throw new BadRequestException(
      `No active ${configured} prompt-image model is configured for contests.`,
    );
  }

  private assertFineTuneContestPromptModel(
    contest: ContestEntity,
    aiService?: string,
  ) {
    if (contest.contestType !== ContestTypeEnum.FINE_TUNE) {
      return;
    }

    const requestedAiService = aiService?.trim();
    if (requestedAiService && requestedAiService !== 'sdxl_lora_generation') {
      throw new BadRequestException(
        'Fine-tune contests only accept sdxl_lora_generation prompt image generations.',
      );
    }
  }

  private async getReadyFineTuneByLoraKey(
    loraKey: string,
  ): Promise<AIFinetuneEntity> {
    const fineTune = await this.aiFinetuneRepository.findOne({
      where: { loraKey, modelFamily: 'sdxl' },
    });

    if (!fineTune) {
      throw new BadRequestException(
        `Fine-tune "${loraKey}" is not configured.`,
      );
    }

    if (
      (fineTune.modelFamily ?? 'sdxl') !== 'sdxl' ||
      fineTune.status !== 'ready' ||
      !fineTune.loraUrl
    ) {
      throw new BadRequestException(
        `Fine-tune "${loraKey}" is not ready for generation.`,
      );
    }

    return fineTune;
  }
}
