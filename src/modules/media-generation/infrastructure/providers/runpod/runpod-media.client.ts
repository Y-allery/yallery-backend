import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  RunpodJobResponse,
  RunpodOutputType,
} from './runpod-media.types';

@Injectable()
export class RunpodMediaClient {
  constructor(private readonly configService: ConfigService) {}

  async submitJob(
    endpointId: string,
    payload: { input: Record<string, unknown> },
  ): Promise<RunpodJobResponse> {
    const response = await axios.post<RunpodJobResponse>(
      `${this.getApiBaseUrl()}/${endpointId}/run`,
      payload,
      {
        headers: this.getHeaders(),
        timeout: this.getRequestTimeoutMs(),
      },
    );

    return response.data;
  }

  async submitSyncJob(
    endpointId: string,
    input: Record<string, unknown>,
  ): Promise<RunpodJobResponse> {
    const response = await axios.post<RunpodJobResponse>(
      `${this.getApiBaseUrl()}/${endpointId}/runsync`,
      {
        input,
      },
      {
        headers: this.getHeaders(),
        timeout: this.getSyncRequestTimeoutMs(),
      },
    );

    return response.data;
  }

  async waitForCompletion(
    endpointId: string,
    initialJob: RunpodJobResponse,
    hasExtractableOutput: (output: unknown) => boolean,
    outputType: RunpodOutputType = 'image',
  ): Promise<RunpodJobResponse> {
    let currentJob = initialJob;
    const startedAt = Date.now();
    let completedWithoutOutputPolls = 0;

    while (true) {
      if (currentJob.status === 'COMPLETED') {
        if (hasExtractableOutput(currentJob.output)) {
          return currentJob;
        }

        completedWithoutOutputPolls += 1;
        if (completedWithoutOutputPolls > this.getCompletedOutputRetryCount()) {
          throw new BadGatewayException(
            `RunPod job ${currentJob.id} completed without output after ${completedWithoutOutputPolls} status checks`,
          );
        }

        await this.sleep(this.getCompletedOutputRetryDelayMs());
        currentJob = await this.fetchJobStatus(endpointId, currentJob.id);
        continue;
      }

      if (
        currentJob.status === 'FAILED' ||
        currentJob.status === 'CANCELLED' ||
        currentJob.status === 'TIMED_OUT'
      ) {
        throw new BadGatewayException(
          `RunPod job ${currentJob.id} failed with status ${currentJob.status}${currentJob.error ? `: ${currentJob.error}` : ''}`,
        );
      }

      if (Date.now() - startedAt > this.getStatusTimeoutMs(outputType)) {
        throw new GatewayTimeoutException(
          `RunPod job ${currentJob.id} did not finish within ${this.getStatusTimeoutMs(outputType)}ms`,
        );
      }

      await this.sleep(this.getPollIntervalMs());
      currentJob = await this.fetchJobStatus(endpointId, currentJob.id);
    }
  }

  async fetchJobStatus(
    endpointId: string,
    jobId: string,
  ): Promise<RunpodJobResponse> {
    const response = await axios.get<RunpodJobResponse>(
      `${this.getApiBaseUrl()}/${endpointId}/status/${jobId}`,
      {
        headers: this.getHeaders(),
        timeout: this.getRequestTimeoutMs(),
      },
    );

    return response.data;
  }

  private getApiBaseUrl(): string {
    return (
      this.configService.get<string>('RUNPOD_API_BASE_URL') ||
      'https://api.runpod.ai/v2'
    );
  }

  private getHeaders() {
    return {
      Authorization: `Bearer ${this.getRequiredConfig('RUNPOD_API_KEY')}`,
      'Content-Type': 'application/json',
    };
  }

  private getRequiredConfig(key: string): string {
    const value = this.configService.get<string>(key);

    if (!value) {
      throw new Error(`${key} is not configured`);
    }

    return value;
  }

  private getPollIntervalMs(): number {
    return Number(
      this.configService.get<string>('RUNPOD_POLL_INTERVAL_MS') || 5000,
    );
  }

  private getStatusTimeoutMs(outputType: RunpodOutputType = 'image'): number {
    const configuredValue = this.configService.get<string>(
      'RUNPOD_STATUS_TIMEOUT_MS',
    );

    if (configuredValue) {
      return Number(configuredValue);
    }

    return outputType === 'video' ? 1800000 : 600000;
  }

  private getRequestTimeoutMs(): number {
    return Number(
      this.configService.get<string>('RUNPOD_REQUEST_TIMEOUT_MS') || 30000,
    );
  }

  private getSyncRequestTimeoutMs(): number {
    return Number(
      this.configService.get<string>('RUNPOD_SYNC_REQUEST_TIMEOUT_MS') ||
        this.getStatusTimeoutMs(),
    );
  }

  private getCompletedOutputRetryCount(): number {
    return Number(
      this.configService.get<string>('RUNPOD_COMPLETED_OUTPUT_RETRY_COUNT') ||
        6,
    );
  }

  private getCompletedOutputRetryDelayMs(): number {
    return Number(
      this.configService.get<string>('RUNPOD_COMPLETED_OUTPUT_RETRY_DELAY_MS') ||
        2000,
    );
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
