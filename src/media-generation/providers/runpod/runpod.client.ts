import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import axios, { AxiosError, AxiosRequestConfig, Method } from 'axios';
import { RunpodConfigService } from './runpod.config.service';
import { RunpodEndpointType } from './runpod.constants';
import {
  RunpodCancelResponse,
  RunpodHealthResponse,
  RunpodJobRequest,
  RunpodQueuedResponse,
  RunpodRunSyncOptions,
  RunpodStatusOptions,
  RunpodStatusResponse,
  RunpodWaitForCompletionOptions,
} from './runpod.types';

@Injectable()
export class RunpodClient {
  private readonly logger = new Logger(RunpodClient.name);

  constructor(private readonly runpodConfigService: RunpodConfigService) {}

  isEnabled(endpointType?: RunpodEndpointType): boolean {
    return this.runpodConfigService.isEnabled(endpointType);
  }

  async run<TInput extends Record<string, unknown>>(
    endpointType: RunpodEndpointType,
    payload: RunpodJobRequest<TInput>,
  ): Promise<RunpodQueuedResponse> {
    return this.request<RunpodQueuedResponse>(endpointType, 'POST', '/run', {
      data: payload,
    });
  }

  async runSync<TInput extends Record<string, unknown>, TOutput = unknown>(
    endpointType: RunpodEndpointType,
    payload: RunpodJobRequest<TInput>,
    options?: RunpodRunSyncOptions,
  ): Promise<RunpodStatusResponse<TOutput>> {
    return this.request<RunpodStatusResponse<TOutput>>(
      endpointType,
      'POST',
      '/runsync',
      {
        data: payload,
        params: options?.waitMs ? { wait: options.waitMs } : undefined,
      },
    );
  }

  async getStatus<TOutput = unknown>(
    endpointType: RunpodEndpointType,
    jobId: string,
    options?: RunpodStatusOptions,
  ): Promise<RunpodStatusResponse<TOutput>> {
    return this.request<RunpodStatusResponse<TOutput>>(
      endpointType,
      'GET',
      `/status/${jobId}`,
      {
        params: options?.ttlMs ? { ttl: options.ttlMs } : undefined,
      },
    );
  }

  async cancel(
    endpointType: RunpodEndpointType,
    jobId: string,
  ): Promise<RunpodCancelResponse> {
    return this.request<RunpodCancelResponse>(
      endpointType,
      'POST',
      `/cancel/${jobId}`,
    );
  }

  async getHealth(
    endpointType: RunpodEndpointType,
  ): Promise<RunpodHealthResponse> {
    return this.request<RunpodHealthResponse>(endpointType, 'GET', '/health');
  }

  async waitForCompletion<TOutput = unknown>(
    endpointType: RunpodEndpointType,
    jobId: string,
    options?: RunpodWaitForCompletionOptions,
  ): Promise<RunpodStatusResponse<TOutput>> {
    const pollIntervalMs =
      options?.pollIntervalMs ?? this.runpodConfigService.getPollIntervalMs();
    const timeoutMs =
      options?.timeoutMs ??
      this.runpodConfigService.getDefaultPolicy().executionTimeout ??
      600000;
    const startedAt = Date.now();

    while (true) {
      const status = await this.getStatus<TOutput>(endpointType, jobId, options);
      const currentStatus = (status.status || '').toUpperCase();

      if (currentStatus === 'COMPLETED') {
        return status;
      }

      if (['FAILED', 'CANCELLED', 'TIMED_OUT'].includes(currentStatus)) {
        const detail =
          typeof status.error === 'string'
            ? status.error
            : JSON.stringify(status.error ?? status);
        throw new BadGatewayException(
          `RunPod job ${jobId} failed with status ${currentStatus}: ${detail}`,
        );
      }

      if (Date.now() - startedAt >= timeoutMs) {
        throw new GatewayTimeoutException(
          `RunPod job ${jobId} did not complete within ${timeoutMs}ms`,
        );
      }

      await this.sleep(pollIntervalMs);
    }
  }

  getDefaultPolicy() {
    return this.runpodConfigService.getDefaultPolicy();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async request<T>(
    endpointType: RunpodEndpointType,
    method: Method,
    path: string,
    overrides: Partial<AxiosRequestConfig> = {},
  ): Promise<T> {
    const endpointId = this.runpodConfigService.getEndpointIdOrThrow(endpointType);
    const apiKey = this.runpodConfigService.getApiKeyOrThrow();
    const url = `${this.runpodConfigService.getBaseUrl()}/${endpointId}${path}`;

    try {
      const authorization = apiKey.startsWith('Bearer ')
        ? apiKey
        : `Bearer ${apiKey}`;

      const response = await axios.request<T>({
        method,
        url,
        timeout: this.runpodConfigService.getRequestTimeoutMs(),
        headers: {
          accept: 'application/json',
          authorization,
          'content-type': 'application/json',
        },
        ...overrides,
      });

      return response.data;
    } catch (error) {
      throw this.toHttpError(error as AxiosError, method, endpointType, path);
    }
  }

  private toHttpError(
    error: AxiosError,
    method: Method,
    endpointType: RunpodEndpointType,
    path: string,
  ): HttpException {
    const status = error.response?.status;
    const responseData = error.response?.data;
    const detail =
      typeof responseData === 'string'
        ? responseData
        : JSON.stringify(responseData ?? error.message);

    this.logger.error(
      `RunPod ${method} ${endpointType}${path} failed (${status ?? 'network'})`,
      detail,
    );

    if (status) {
      return new HttpException(
        `RunPod request failed for ${endpointType}${path}: ${detail}`,
        status,
      );
    }

    return new BadGatewayException(
      `RunPod request failed for ${endpointType}${path}: ${detail}`,
    );
  }
}
