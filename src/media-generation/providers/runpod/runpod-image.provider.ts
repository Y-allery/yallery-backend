import {
  BadGatewayException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RunpodEndpointType } from './runpod.constants';
import { RunpodClient } from './runpod.client';
import {
  RunpodGeneratedImageAsset,
  RunpodHealthResponse,
  RunpodImageGenerationResult,
  RunpodImageGenerationStatus,
  RunpodStatusResponse,
  RunpodTextToImageInput,
} from './runpod.types';
import { RunpodConfigService } from './runpod.config.service';

interface GenerateRunpodImageParams {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  imageQuantity: number;
}

interface QueuedRunpodImageGeneration {
  jobId: string;
  providerModel: string;
}

@Injectable()
export class RunpodImageProvider {
  constructor(
    private readonly runpodClient: RunpodClient,
    private readonly runpodConfigService: RunpodConfigService,
  ) {}

  async generate(
    params: GenerateRunpodImageParams,
  ): Promise<RunpodImageGenerationResult> {
    if (!this.runpodClient.isEnabled(RunpodEndpointType.IMAGE)) {
      throw new ServiceUnavailableException(
        'RunPod image endpoint is not configured',
      );
    }

    const providerModel = this.runpodConfigService.getImageModel() || 'default';
    const input = this.buildInput(params, providerModel);
    const timeoutMs =
      (this.runpodClient.getDefaultPolicy().executionTimeout ?? 600000) + 120000;
    const runSyncWaitMs = Math.min(timeoutMs, 300000);

    const syncResult = await this.runpodClient.runSync<
      RunpodTextToImageInput,
      unknown
    >(
      RunpodEndpointType.IMAGE,
      {
        input,
        policy: this.runpodClient.getDefaultPolicy(),
      },
      {
        waitMs: runSyncWaitMs,
      },
    );

    const currentStatus = (syncResult.status || '').toUpperCase();

    if (['FAILED', 'CANCELLED', 'TIMED_OUT'].includes(currentStatus)) {
      const detail =
        typeof syncResult.error === 'string'
          ? syncResult.error
          : JSON.stringify(syncResult.error ?? syncResult);

      throw new BadGatewayException(
        `RunPod job ${syncResult.id} failed with status ${currentStatus}: ${detail}`,
      );
    }

    const result =
      currentStatus === 'COMPLETED'
        ? syncResult
        : await this.runpodClient.waitForCompletion(RunpodEndpointType.IMAGE, syncResult.id, {
            timeoutMs,
          });

    const assets = this.extractAssets(result);
    if (assets.length === 0) {
      throw new Error(
        `RunPod returned no image assets. Job: ${result.id}. Output: ${JSON.stringify(result.output)}`,
      );
    }

    return {
      jobId: result.id,
      providerModel,
      assets,
    };
  }

  async submitGeneration(
    params: GenerateRunpodImageParams,
  ): Promise<QueuedRunpodImageGeneration> {
    if (!this.runpodClient.isEnabled(RunpodEndpointType.IMAGE)) {
      throw new ServiceUnavailableException(
        'RunPod image endpoint is not configured',
      );
    }

    const providerModel = this.runpodConfigService.getImageModel() || 'default';
    const input = this.buildInput(params, providerModel);

    const queuedJob = await this.runpodClient.run(RunpodEndpointType.IMAGE, {
      input,
      policy: this.runpodClient.getDefaultPolicy(),
    });

    const jobId = queuedJob.id;
    if (!jobId) {
      throw new Error(
        `RunPod did not return a job id. Response: ${JSON.stringify(queuedJob)}`,
      );
    }

    return {
      jobId,
      providerModel,
    };
  }

  async waitForGeneration(jobId: string): Promise<RunpodGeneratedImageAsset[]> {
    const result = await this.runpodClient.waitForCompletion(
      RunpodEndpointType.IMAGE,
      jobId,
      {
        timeoutMs:
          (this.runpodClient.getDefaultPolicy().executionTimeout ?? 600000) +
          120000,
      },
    );

    const assets = this.extractAssets(result);
    if (assets.length === 0) {
      throw new Error(
        `RunPod returned no image assets. Job: ${jobId}. Output: ${JSON.stringify(result.output)}`,
      );
    }

    return assets;
  }

  async getEndpointHealth(): Promise<RunpodHealthResponse> {
    if (!this.runpodClient.isEnabled(RunpodEndpointType.IMAGE)) {
      throw new ServiceUnavailableException(
        'RunPod image endpoint is not configured',
      );
    }

    return this.runpodClient.getHealth(RunpodEndpointType.IMAGE);
  }

  async getGenerationStatus(jobId: string): Promise<RunpodImageGenerationStatus> {
    const providerModel = this.runpodConfigService.getImageModel() || 'default';

    try {
      const result = await this.runpodClient.getStatus<unknown>(
        RunpodEndpointType.IMAGE,
        jobId,
      );

      const currentStatus = (result.status || '').toUpperCase();

      if (currentStatus === 'COMPLETED') {
        const assets = this.extractAssets(result);
        if (assets.length === 0) {
          return {
            state: 'failed',
            jobId,
            providerModel,
            rawStatus: currentStatus,
            error: `RunPod returned no image assets. Job: ${jobId}. Output: ${JSON.stringify(result.output)}`,
          };
        }

        return {
          state: 'completed',
          jobId,
          providerModel,
          rawStatus: currentStatus,
          assets,
        };
      }

      if (['FAILED', 'CANCELLED', 'TIMED_OUT'].includes(currentStatus)) {
        const detail =
          typeof result.error === 'string'
            ? result.error
            : JSON.stringify(result.error ?? result);

        return {
          state: 'failed',
          jobId,
          providerModel,
          rawStatus: currentStatus,
          error: `RunPod job ${jobId} failed with status ${currentStatus}: ${detail}`,
        };
      }

      return {
        state: 'pending',
        jobId,
        providerModel,
        rawStatus: currentStatus || 'UNKNOWN',
      };
    } catch (error) {
      if (this.isTransientStatusNotFound(error)) {
        return {
          state: 'pending',
          jobId,
          providerModel,
          rawStatus: 'REQUEST_NOT_VISIBLE',
        };
      }

      throw error;
    }
  }

  private buildInput(
    params: GenerateRunpodImageParams,
    providerModel: string,
  ): RunpodTextToImageInput {
    return {
      prompt: params.prompt,
      negative_prompt: params.negativePrompt,
      model: providerModel === 'default' ? undefined : providerModel,
      width: params.width,
      height: params.height,
      num_images: params.imageQuantity,
      output_format: 'png',
    };
  }

  private extractAssets(result: RunpodStatusResponse<unknown>): RunpodGeneratedImageAsset[] {
    const assets: RunpodGeneratedImageAsset[] = [];
    const dedupe = new Set<string>();
    const visited = new Set<unknown>();

    const walk = (value: unknown) => {
      if (value == null || visited.has(value)) {
        return;
      }

      if (typeof value === 'string') {
        if (this.looksLikeImageUrl(value)) {
          const key = `url:${value}`;
          if (!dedupe.has(key)) {
            dedupe.add(key);
            assets.push({ kind: 'url', url: value });
          }
        }
        return;
      }

      if (typeof value !== 'object') {
        return;
      }

      visited.add(value);

      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }

      const record = value as Record<string, unknown>;
      const directKeys = [
        'url',
        'image',
        'image_url',
        'imageUrl',
        'secure_url',
        'secureUrl',
      ];

      for (const key of directKeys) {
        const candidate = record[key];
        if (typeof candidate === 'string' && this.looksLikeImageUrl(candidate)) {
          const dedupeKey = `url:${candidate}`;
          if (!dedupe.has(dedupeKey)) {
            dedupe.add(dedupeKey);
            assets.push({ kind: 'url', url: candidate });
          }
        }
      }

      const base64Candidate = this.extractBase64Asset(record);
      if (base64Candidate) {
        const dedupeKey = `base64:${base64Candidate.mimeType}:${base64Candidate.base64}`;
        if (!dedupe.has(dedupeKey)) {
          dedupe.add(dedupeKey);
          assets.push(base64Candidate);
        }
      }

      Object.values(record).forEach(walk);
    };

    walk(result.output);

    return assets;
  }

  private looksLikeImageUrl(value: string): boolean {
    return /^https?:\/\//i.test(value) && !/\s/.test(value);
  }

  private extractBase64Asset(
    record: Record<string, unknown>,
  ): RunpodGeneratedImageAsset | null {
    const base64Keys = ['base64', 'b64_json', 'data'];

    for (const key of base64Keys) {
      const candidate = record[key];
      if (typeof candidate !== 'string') {
        continue;
      }

      const normalized = this.normalizeBase64(candidate);
      if (!normalized) {
        continue;
      }

      return {
        kind: 'base64',
        base64: normalized.base64,
        mimeType:
          normalized.mimeType ||
          this.readString(record, ['mime_type', 'mimeType', 'content_type']) ||
          'image/png',
      };
    }

    return null;
  }

  private normalizeBase64(
    candidate: string,
  ): { base64: string; mimeType?: string } | null {
    const trimmed = candidate.trim();
    if (!trimmed) {
      return null;
    }

    const dataUrlMatch = trimmed.match(/^data:([^;]+);base64,(.+)$/i);
    if (dataUrlMatch) {
      return {
        mimeType: dataUrlMatch[1],
        base64: dataUrlMatch[2],
      };
    }

    if (/^[A-Za-z0-9+/=\r\n]+$/.test(trimmed)) {
      return { base64: trimmed.replace(/\s+/g, '') };
    }

    return null;
  }

  private readString(
    record: Record<string, unknown>,
    keys: string[],
  ): string | undefined {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return undefined;
  }

  private isTransientStatusNotFound(error: unknown): error is HttpException {
    if (!(error instanceof HttpException) || error.getStatus() !== 404) {
      return false;
    }

    const response = error.getResponse();
    const detail =
      typeof response === 'string' ? response : JSON.stringify(response);

    return detail.toLowerCase().includes('request does not exist');
  }
}
