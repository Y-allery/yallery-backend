import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { RunpodEndpointType } from './runpod.constants';
import { RunpodClient } from './runpod.client';
import {
  RunpodGeneratedImageAsset,
  RunpodImageGenerationResult,
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

@Injectable()
export class RunpodImageProvider {
  constructor(
    private readonly runpodClient: RunpodClient,
    private readonly runpodConfigService: RunpodConfigService,
  ) {}

  async generate(params: GenerateRunpodImageParams): Promise<RunpodImageGenerationResult> {
    if (!this.runpodClient.isEnabled(RunpodEndpointType.IMAGE)) {
      throw new ServiceUnavailableException(
        'RunPod image endpoint is not configured',
      );
    }

    const providerModel = this.runpodConfigService.getImageModel() || 'default';

    const input: RunpodTextToImageInput = {
      prompt: params.prompt,
      negative_prompt: params.negativePrompt,
      model: providerModel === 'default' ? undefined : providerModel,
      width: params.width,
      height: params.height,
      num_images: params.imageQuantity,
      output_format: 'png',
    };

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

    return {
      jobId,
      providerModel,
      assets,
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
}
