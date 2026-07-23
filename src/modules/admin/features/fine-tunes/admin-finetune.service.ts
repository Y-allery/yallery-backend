import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CreateAIFinetuneDto } from 'src/modules/admin/dto/create-ai-finetune.dto';
import {
  AI_FINETUNE_DEFAULT_BASE_MODELS,
  AIFinetuneEntity,
  AIFinetuneModelFamily,
  AIFinetuneStatus,
} from 'src/modules/admin/entities/ai-finetune.entity';
import { LoraKeyService } from './lora-key.service';
import {
  mapRunpodStatusToFineTuneStatus,
  RunpodJobStatus,
} from './runpod-finetune.types';
import { RunpodFineTuneClient } from './runpod-finetune.client';

const ACTIVE_STATUSES: AIFinetuneStatus[] = ['pending', 'queued', 'training'];
const REFRESH_CONCURRENCY = 3;
const MODEL_TRAINING_DEFAULTS: Record<
  AIFinetuneModelFamily,
  Required<NonNullable<AIFinetuneEntity['trainingSettings']>>
> = {
  sdxl: {
    resolution: 512,
    maxTrainSteps: 800,
    rank: 4,
    trainBatchSize: 1,
    gradientAccumulationSteps: 4,
    learningRate: '1e-4',
    mixedPrecision: 'fp16',
    seed: 42,
    enableRandomFlip: false,
  },
  krea2: {
    resolution: 1024,
    maxTrainSteps: 1000,
    rank: 32,
    trainBatchSize: 1,
    gradientAccumulationSteps: 1,
    learningRate: '3e-4',
    mixedPrecision: 'bf16',
    seed: 0,
    enableRandomFlip: false,
  },
};

@Injectable()
export class AdminFineTuneService {
  private readonly logger = new Logger(AdminFineTuneService.name);
  private isRefreshSweepRunning = false;

  constructor(
    @InjectRepository(AIFinetuneEntity)
    private readonly aiFinetuneRepository: Repository<AIFinetuneEntity>,
    private readonly loraKeyService: LoraKeyService,
    private readonly runpodFineTuneClient: RunpodFineTuneClient,
  ) {}

  async previewFineTuneLoraKey(triggerWord: string) {
    const normalizedTriggerWord = this.loraKeyService.normalize(
      triggerWord,
      80,
    );
    if (!normalizedTriggerWord) {
      throw new BadRequestException('triggerWord is required');
    }

    const loraKey = await this.loraKeyService.generateUnique(
      normalizedTriggerWord,
    );
    return {
      triggerWord: normalizedTriggerWord,
      loraKey,
    };
  }

  async getFineTunes(status?: AIFinetuneStatus) {
    const where = status ? { status } : {};
    return this.aiFinetuneRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  // Keeps list GET a pure read: active jobs are polled from RunPod here
  // instead, so the admin list shows at most ~2 min stale statuses.
  @Cron('*/2 * * * *')
  async refreshActiveFineTunes() {
    if (this.isRefreshSweepRunning) {
      return;
    }
    this.isRefreshSweepRunning = true;
    try {
      const activeItems = await this.aiFinetuneRepository.find({
        where: { status: In(ACTIVE_STATUSES) },
      });

      for (let i = 0; i < activeItems.length; i += REFRESH_CONCURRENCY) {
        await Promise.allSettled(
          activeItems.slice(i, i + REFRESH_CONCURRENCY).map(async (item) => {
            try {
              await this.refreshFineTuneStatus(item);
            } catch (error) {
              this.logger.warn(
                `Failed to refresh fine-tune ${item.id}: ${error.message}`,
              );
            }
          }),
        );
      }
    } catch (error) {
      this.logger.warn(`Fine-tune refresh sweep failed: ${error.message}`);
    } finally {
      this.isRefreshSweepRunning = false;
    }
  }

  async createFineTune(dto: CreateAIFinetuneDto) {
    const name = dto.name?.trim();
    const triggerWord = this.loraKeyService.normalize(dto.triggerWord, 80);
    const modelFamily = dto.modelFamily ?? 'sdxl';
    const baseModel =
      dto.baseModel?.trim() ?? AI_FINETUNE_DEFAULT_BASE_MODELS[modelFamily];
    const className = this.loraKeyService.normalize(
      dto.className || 'character',
      80,
    );

    if (!name) {
      throw new BadRequestException('name is required');
    }
    if (!triggerWord) {
      throw new BadRequestException('triggerWord is required');
    }
    this.assertCompatibleBaseModel(modelFamily, baseModel);

    const loraKey = dto.loraKey
      ? this.loraKeyService.normalize(dto.loraKey, 100)
      : await this.loraKeyService.generateUnique(triggerWord);

    if (!loraKey) {
      throw new BadRequestException('loraKey is invalid');
    }

    const existing = await this.aiFinetuneRepository.findOne({
      where: { loraKey },
    });
    if (existing) {
      throw new BadRequestException(`loraKey "${loraKey}" already exists`);
    }

    const defaults = MODEL_TRAINING_DEFAULTS[modelFamily];
    const trainingSettings = {
      resolution: dto.training?.resolution ?? defaults.resolution,
      maxTrainSteps: dto.training?.maxTrainSteps ?? defaults.maxTrainSteps,
      rank: dto.training?.rank ?? defaults.rank,
      trainBatchSize: dto.training?.trainBatchSize ?? defaults.trainBatchSize,
      gradientAccumulationSteps:
        dto.training?.gradientAccumulationSteps ??
        defaults.gradientAccumulationSteps,
      learningRate: dto.training?.learningRate ?? defaults.learningRate,
      mixedPrecision: dto.training?.mixedPrecision ?? defaults.mixedPrecision,
      seed: dto.training?.seed ?? defaults.seed,
      enableRandomFlip:
        dto.training?.enableRandomFlip ?? defaults.enableRandomFlip,
    };
    const generationDefaults = {
      loraScale: dto.generationDefaults?.loraScale ?? 0.8,
    };

    const entity = this.aiFinetuneRepository.create({
      name,
      triggerWord,
      loraKey,
      className,
      modelFamily,
      baseModel,
      status: 'pending',
      datasetImages: dto.datasetImages.map((image) => ({
        ...image,
        caption: image.caption?.trim() || undefined,
      })),
      datasetImageCount: dto.datasetImages.length,
      trainingSettings,
      generationDefaults,
      runpodEndpointId:
        await this.runpodFineTuneClient.getEndpointId(modelFamily),
      runpodJobId: null,
      loraUrl: null,
      errorMessage: null,
      rawOutput: null,
    });

    const saved = await this.aiFinetuneRepository.save(entity);
    return this.queueFineTuneTraining(saved);
  }

  async getFineTuneStatus(id: number) {
    const item = await this.aiFinetuneRepository.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('Fine-tune not found');
    }
    return this.refreshFineTuneStatus(item);
  }

  private async queueFineTuneTraining(item: AIFinetuneEntity) {
    const modelFamily = item.modelFamily ?? 'sdxl';
    const sourceImages = item.datasetImages.filter((image) => image.url);
    const datasetImages =
      modelFamily === 'krea2'
        ? sourceImages.map((image) => ({
            url: image.url,
            ...(image.caption ? { caption: image.caption } : {}),
          }))
        : sourceImages.map((image) => image.url);

    if (datasetImages.length < 10) {
      throw new BadRequestException('At least 10 dataset images are required');
    }

    const hasPerImageCaptions = sourceImages.some((image) =>
      Boolean(image.caption),
    );
    const job = await this.runpodFineTuneClient.submitJob(modelFamily, {
      name: item.name,
      triggerWord: item.triggerWord,
      loraKey: item.loraKey,
      className: item.className,
      modelFamily,
      ...(modelFamily === 'krea2' ? { baseModel: item.baseModel } : {}),
      datasetImages,
      captionMode:
        modelFamily === 'krea2' && hasPerImageCaptions
          ? 'per_image'
          : 'template',
      ...(item.trainingSettings || {}),
      loraScale: item.generationDefaults?.loraScale ?? 0.8,
    });

    item.status = this.mapRunpodStatusToFineTuneStatus(job.status);
    item.runpodJobId = job.id;
    item.rawOutput = job;
    item.errorMessage = null;

    return this.aiFinetuneRepository.save(item);
  }

  private async refreshFineTuneStatus(item: AIFinetuneEntity) {
    if (!item.runpodJobId || !item.runpodEndpointId) {
      return item;
    }

    if (['ready', 'failed'].includes(item.status)) {
      return item;
    }

    const modelFamily = item.modelFamily ?? 'sdxl';
    const job = await this.runpodFineTuneClient.getJobStatus(
      modelFamily,
      item.runpodEndpointId,
      item.runpodJobId,
    );
    item.rawOutput = job;
    item.status = this.mapRunpodStatusToFineTuneStatus(job.status);

    if (job.status === 'COMPLETED') {
      const output = job.output || {};
      const compatibilityError = this.getArtifactCompatibilityError(
        item,
        output,
      );
      if (compatibilityError) {
        item.status = 'failed';
        item.loraUrl = null;
        item.errorMessage = compatibilityError;
      } else {
        item.status = 'ready';
        item.loraUrl = output.loraUrl || item.loraUrl;
        item.errorMessage = null;
      }
    }

    if (['FAILED', 'CANCELLED', 'TIMED_OUT'].includes(job.status)) {
      item.status = 'failed';
      item.errorMessage =
        job.error ||
        job.output?.error ||
        job.output?.errorMessage ||
        `RunPod job ${job.status.toLowerCase()}`;
    }

    return this.aiFinetuneRepository.save(item);
  }

  private mapRunpodStatusToFineTuneStatus(
    status: RunpodJobStatus,
  ): AIFinetuneStatus {
    return mapRunpodStatusToFineTuneStatus(status);
  }

  private assertCompatibleBaseModel(
    modelFamily: AIFinetuneModelFamily,
    baseModel: string,
  ): void {
    const supportedBaseModel = AI_FINETUNE_DEFAULT_BASE_MODELS[modelFamily];
    if (baseModel !== supportedBaseModel) {
      throw new BadRequestException(
        `baseModel "${baseModel}" is not compatible with modelFamily "${modelFamily}". Expected "${supportedBaseModel}".`,
      );
    }
  }

  private getArtifactCompatibilityError(
    item: AIFinetuneEntity,
    output: Record<string, unknown>,
  ): string | null {
    const expectedFamily = item.modelFamily ?? 'sdxl';
    const outputFamily = String(
      output.modelFamily ?? output.model_family ?? '',
    ).trim();
    const outputBaseModel = String(
      output.baseModel ?? output.base_model ?? '',
    ).trim();

    if (outputFamily && outputFamily !== expectedFamily) {
      return `RunPod returned a ${outputFamily} artifact for a ${expectedFamily} fine-tune`;
    }
    if (
      outputBaseModel &&
      outputBaseModel !== item.baseModel &&
      !(expectedFamily === 'sdxl' && outputBaseModel === '/app/model')
    ) {
      return `RunPod returned baseModel "${outputBaseModel}", expected "${item.baseModel}"`;
    }

    // Legacy SDXL workers predate compatibility metadata. Krea jobs are new,
    // so require an explicit handshake before exposing the LoRA as reusable.
    if (expectedFamily === 'krea2' && !outputFamily) {
      return 'RunPod Krea 2 artifact is missing modelFamily compatibility metadata';
    }
    if (expectedFamily === 'krea2' && !outputBaseModel) {
      return 'RunPod Krea 2 artifact is missing baseModel compatibility metadata';
    }
    if (expectedFamily === 'krea2' && !output.loraUrl) {
      return 'RunPod completed without a LoRA artifact URL';
    }

    return null;
  }
}
