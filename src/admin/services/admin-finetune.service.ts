import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { CreateAIFinetuneDto } from '../dto/create-ai-finetune.dto';
import {
  AIFinetuneEntity,
  AIFinetuneStatus,
} from '../entities/ai-finetune.entity';

type RunpodJobStatus =
  | 'IN_QUEUE'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'TIMED_OUT';

interface RunpodJobResponse {
  id: string;
  status: RunpodJobStatus;
  output?: any;
  error?: string;
}

@Injectable()
export class AdminFineTuneService {
  private readonly logger = new Logger(AdminFineTuneService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(AIFinetuneEntity)
    private readonly aiFinetuneRepository: Repository<AIFinetuneEntity>,
  ) {}

  async previewFineTuneLoraKey(triggerWord: string) {
    const normalizedTriggerWord = this.normalizeLoraKeyPart(triggerWord, 80);
    if (!normalizedTriggerWord) {
      throw new BadRequestException('triggerWord is required');
    }

    const loraKey = await this.generateUniqueLoraKey(normalizedTriggerWord);
    return {
      triggerWord: normalizedTriggerWord,
      loraKey,
    };
  }

  async getFineTunes(status?: AIFinetuneStatus) {
    const where = status ? { status } : {};
    const items = await this.aiFinetuneRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });

    await Promise.all(
      items
        .filter((item) =>
          ['pending', 'queued', 'training'].includes(item.status),
        )
        .map(async (item) => {
          try {
            await this.refreshFineTuneStatus(item);
          } catch (error) {
            this.logger.warn(
              `Failed to refresh fine-tune ${item.id}: ${error.message}`,
            );
          }
        }),
    );

    return this.aiFinetuneRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async createFineTune(dto: CreateAIFinetuneDto) {
    const name = dto.name?.trim();
    const triggerWord = this.normalizeLoraKeyPart(dto.triggerWord, 80);
    const className = this.normalizeLoraKeyPart(
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
      ? this.normalizeLoraKeyPart(dto.loraKey, 100)
      : await this.generateUniqueLoraKey(triggerWord);

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
      runpodEndpointId: this.getFineTuneRunpodEndpointId(),
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

    const job = await this.submitFineTuneRunpodJob({
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

    const job = await this.getFineTuneRunpodJobStatus(
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

  private async submitFineTuneRunpodJob(input: Record<string, unknown>) {
    const endpointId = this.getFineTuneRunpodEndpointId();
    const response = await axios.post<RunpodJobResponse>(
      `${this.getRunpodApiBaseUrl()}/${endpointId}/run`,
      { input },
      {
        headers: this.getRunpodHeaders(),
        timeout: Number(
          this.configService.get<string>('RUNPOD_REQUEST_TIMEOUT_MS') || 60000,
        ),
      },
    );

    return response.data;
  }

  private async getFineTuneRunpodJobStatus(
    endpointId: string,
    jobId: string,
  ) {
    const response = await axios.get<RunpodJobResponse>(
      `${this.getRunpodApiBaseUrl()}/${endpointId}/status/${jobId}`,
      {
        headers: this.getRunpodHeaders(),
        timeout: Number(
          this.configService.get<string>('RUNPOD_REQUEST_TIMEOUT_MS') || 60000,
        ),
      },
    );

    return response.data;
  }

  private getFineTuneRunpodEndpointId() {
    const endpointId = this.configService.get<string>(
      'RUNPOD_SDXL_LORA_FINETUNE_ENDPOINT_ID',
    );
    if (!endpointId) {
      throw new BadRequestException(
        'RUNPOD_SDXL_LORA_FINETUNE_ENDPOINT_ID is not configured',
      );
    }
    return endpointId;
  }

  private getRunpodApiBaseUrl() {
    return (
      this.configService.get<string>('RUNPOD_API_BASE_URL') ||
      'https://api.runpod.ai/v2'
    );
  }

  private getRunpodHeaders() {
    const apiKey = this.configService.get<string>('RUNPOD_API_KEY');
    if (!apiKey) {
      throw new BadRequestException('RUNPOD_API_KEY is not configured');
    }
    return {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private mapRunpodStatusToFineTuneStatus(
    status: RunpodJobStatus,
  ): AIFinetuneStatus {
    if (status === 'COMPLETED') return 'ready';
    if (status === 'IN_PROGRESS') return 'training';
    if (status === 'IN_QUEUE') return 'queued';
    return 'failed';
  }

  private async generateUniqueLoraKey(baseInput: string) {
    const base = this.normalizeLoraKeyPart(baseInput, 72) || 'lora';

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const suffix = uuidv4().replace(/-/g, '').slice(0, 8);
      const candidate = this.normalizeLoraKeyPart(`${base}_${suffix}`, 100);
      const count = await this.aiFinetuneRepository.count({
        where: { loraKey: candidate },
      });
      if (count === 0) {
        return candidate;
      }
    }

    throw new BadRequestException('Failed to generate unique LoRA key');
  }

  private normalizeLoraKeyPart(value: string, maxLength = 100) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, maxLength)
      .replace(/_+$/g, '');
  }
}
