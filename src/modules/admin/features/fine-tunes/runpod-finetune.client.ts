import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';
import { RunpodJobResponse } from './runpod-finetune.types';

@Injectable()
export class RunpodFineTuneClient {
  constructor(
    private readonly providerRuntimeConfigService: ProviderRuntimeConfigService,
  ) {}

  async getEndpointId() {
    const endpointId = await this.providerRuntimeConfigService.getString(
      'RUNPOD_SDXL_LORA_FINETUNE_ENDPOINT_ID',
    );
    if (!endpointId) {
      throw new BadRequestException(
        'RUNPOD_SDXL_LORA_FINETUNE_ENDPOINT_ID is not configured',
      );
    }
    return endpointId;
  }

  async submitJob(input: Record<string, unknown>) {
    const [endpointId, apiBaseUrl, headers, timeout] = await Promise.all([
      this.getEndpointId(),
      this.getApiBaseUrl(),
      this.getHeaders(),
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

  async getJobStatus(endpointId: string, jobId: string) {
    const [apiBaseUrl, headers, timeout] = await Promise.all([
      this.getApiBaseUrl(),
      this.getHeaders(),
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
      (await this.providerRuntimeConfigService.getString('RUNPOD_API_BASE_URL')) ||
      'https://api.runpod.ai/v2'
    );
  }

  private async getHeaders() {
    const apiKey = await this.providerRuntimeConfigService.getString(
      'RUNPOD_API_KEY',
    );
    if (!apiKey) {
      throw new BadRequestException('RUNPOD_API_KEY is not configured');
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
