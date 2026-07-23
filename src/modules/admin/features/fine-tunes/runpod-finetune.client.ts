import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import { AIFinetuneModelFamily } from 'src/modules/admin/entities/ai-finetune.entity';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';
import { RunpodJobResponse } from './runpod-finetune.types';

const RUNPOD_FINETUNE_CONFIG: Record<
  AIFinetuneModelFamily,
  { endpointKey: string; apiKey: string }
> = {
  krea2: {
    endpointKey: 'RUNPOD_KREA2_LORA_FINETUNE_ENDPOINT_ID',
    apiKey: 'RUNPOD_API_KEY',
  },
};

@Injectable()
export class RunpodFineTuneClient {
  constructor(
    private readonly providerRuntimeConfigService: ProviderRuntimeConfigService,
  ) {}

  async getEndpointId(modelFamily: AIFinetuneModelFamily = 'krea2') {
    const { endpointKey } = RUNPOD_FINETUNE_CONFIG[modelFamily];
    const endpointId =
      await this.providerRuntimeConfigService.getString(endpointKey);
    if (!endpointId) {
      throw new BadRequestException(`${endpointKey} is not configured`);
    }
    return endpointId;
  }

  async submitJob(
    modelFamily: AIFinetuneModelFamily,
    input: Record<string, unknown>,
  ) {
    const [endpointId, apiBaseUrl, headers, timeout] = await Promise.all([
      this.getEndpointId(modelFamily),
      this.getApiBaseUrl(),
      this.getHeaders(modelFamily),
      this.getRequestTimeoutMs(),
    ]);
    const response = await axios.post<RunpodJobResponse>(
      `${apiBaseUrl}/${endpointId}/run`,
      { input },
      {
        headers,
        timeout,
      },
    );

    return response.data;
  }

  async getJobStatus(
    modelFamily: AIFinetuneModelFamily,
    endpointId: string,
    jobId: string,
  ) {
    const [apiBaseUrl, headers, timeout] = await Promise.all([
      this.getApiBaseUrl(),
      this.getHeaders(modelFamily),
      this.getRequestTimeoutMs(),
    ]);
    const response = await axios.get<RunpodJobResponse>(
      `${apiBaseUrl}/${endpointId}/status/${jobId}`,
      {
        headers,
        timeout,
      },
    );

    return response.data;
  }

  private async getApiBaseUrl() {
    return (
      (await this.providerRuntimeConfigService.getString(
        'RUNPOD_API_BASE_URL',
      )) || 'https://api.runpod.ai/v2'
    );
  }

  private async getHeaders(modelFamily: AIFinetuneModelFamily) {
    const { apiKey: apiKeyConfigKey } = RUNPOD_FINETUNE_CONFIG[modelFamily];
    const apiKey =
      await this.providerRuntimeConfigService.getString(apiKeyConfigKey);
    if (!apiKey) {
      throw new BadRequestException(`${apiKeyConfigKey} is not configured`);
    }
    return {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private async getRequestTimeoutMs() {
    return (
      (await this.providerRuntimeConfigService.getNumber(
        'RUNPOD_REQUEST_TIMEOUT_MS',
      )) ?? 60000
    );
  }
}
