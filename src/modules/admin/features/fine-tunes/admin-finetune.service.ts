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
  AIFinetuneEntity,
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

    const trainingSettings = {
      resolution: dto.training?.resolution ?? 512,
      maxTrainSteps: dto.training?.maxTrainSteps ?? 800,
      rank: dto.training?.rank ?? 4,
      trainBatchSize: dto.training?.trainBatchSize ?? 1,
      gradientAccumulationSteps: dto.training?.gradientAccumulationSteps ?? 4,
      learningRate: dto.training?.learningRate ?? '1e-4',
      mixedPrecision: dto.training?.mixedPrecision ?? 'fp16',
      seed: dto.training?.seed ?? 42,
    };
    const generationDefaults = {
      loraScale: dto.generationDefaults?.loraScale ?? 0.8,
    };

    const entity = this.aiFinetuneRepository.create({
      name,
      triggerWord,
      loraKey,
      className,
      status: 'pending',
      datasetImages: dto.datasetImages,
      datasetImageCount: dto.datasetImages.length,
      trainingSettings,
      generationDefaults,
      runpodEndpointId: await this.runpodFineTuneClient.getEndpointId(),
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
    const datasetImages = item.datasetImages
      .map((image) => image.url)
      .filter(Boolean);

    if (datasetImages.length < 10) {
      throw new BadRequestException('At least 10 dataset images are required');
    }

    const job = await this.runpodFineTuneClient.submitJob({
      name: item.name,
      triggerWord: item.triggerWord,
      loraKey: item.loraKey,
      className: item.className,
      datasetImages,
      captionMode: 'template',
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

    const job = await this.runpodFineTuneClient.getJobStatus(
      item.runpodEndpointId,
      item.runpodJobId,
    );
    item.rawOutput = job;
    item.status = this.mapRunpodStatusToFineTuneStatus(job.status);

    if (job.status === 'COMPLETED') {
      const output = job.output || {};
      item.status = 'ready';
      item.loraUrl = output.loraUrl || item.loraUrl;
      item.errorMessage = null;
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
}
