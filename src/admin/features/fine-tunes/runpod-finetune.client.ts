import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { RunpodJobResponse } from './runpod-finetune.types';

@Injectable()
export class RunpodFineTuneClient {
  constructor(private readonly configService: ConfigService) {}

  getEndpointId() {
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

  async submitJob(input: Record<string, unknown>) {
    const endpointId = this.getEndpointId();
    const response = await axios.post<RunpodJobResponse>(
      `${this.getApiBaseUrl()}/${endpointId}/run`,
      { input },
      {
        headers: this.getHeaders(),
        timeout: this.getRequestTimeoutMs(),
      },
    );

    return response.data;
  }

  async getJobStatus(endpointId: string, jobId: string) {
    const response = await axios.get<RunpodJobResponse>(
      `${this.getApiBaseUrl()}/${endpointId}/status/${jobId}`,
      {
        headers: this.getHeaders(),
        timeout: this.getRequestTimeoutMs(),
      },
    );

    return response.data;
  }

  private getApiBaseUrl() {
    return (
      this.configService.get<string>('RUNPOD_API_BASE_URL') ||
      'https://api.runpod.ai/v2'
    );
  }

  private getHeaders() {
    const apiKey = this.configService.get<string>('RUNPOD_API_KEY');
    if (!apiKey) {
      throw new BadRequestException('RUNPOD_API_KEY is not configured');
    }
    return {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private getRequestTimeoutMs() {
    return Number(
      this.configService.get<string>('RUNPOD_REQUEST_TIMEOUT_MS') || 60000,
    );
  }
}
