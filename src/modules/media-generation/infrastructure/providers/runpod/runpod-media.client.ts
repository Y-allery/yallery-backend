import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
} from '@nestjs/common';
import axios from 'axios';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';
import { RunpodJobResponse } from './runpod-media.types';

const MAX_DECODED_VIDEO_BYTES = 300 * 1024 * 1024;
const BASE64_EXPANSION_NUMERATOR = 4;
const BASE64_EXPANSION_DENOMINATOR = 3;
const JOB_RESPONSE_JSON_HEADROOM_BYTES = 1024 * 1024;

/**
 * Axios buffers JSON responses before returning them. RunPod may place an
 * inline base64 MP4 in a completed-job response, so keep the transport cap
 * large enough for the existing 300 MiB decoded-video ceiling plus base64
 * expansion and bounded JSON metadata, while rejecting an unbounded response
 * before it can consume the process heap.
 */
export const RUNPOD_JOB_RESPONSE_MAX_BYTES =
  Math.ceil(
    (MAX_DECODED_VIDEO_BYTES * BASE64_EXPANSION_NUMERATOR) /
      BASE64_EXPANSION_DENOMINATOR,
  ) + JOB_RESPONSE_JSON_HEADROOM_BYTES;

@Injectable()
export class RunpodMediaClient {
  constructor(
    private readonly providerRuntimeConfigService: ProviderRuntimeConfigService,
  ) {}

  async submitJob(
    endpointId: string,
    payload: { input: Record<string, unknown> },
    apiKeyConfigKey?: string,
  ): Promise<RunpodJobResponse> {
    const [apiBaseUrl, headers, timeout] = await Promise.all([
      this.getApiBaseUrl(),
      this.getHeaders(apiKeyConfigKey),
      this.getRequestTimeoutMs(),
    ]);
    const response = await axios.post<RunpodJobResponse>(
      `${apiBaseUrl}/${endpointId}/run`,
      payload,
      {
        headers,
        timeout,
        maxContentLength: RUNPOD_JOB_RESPONSE_MAX_BYTES,
      },
    );

    return response.data;
  }

  async waitForCompletion(
    endpointId: string,
    initialJob: RunpodJobResponse,
    hasExtractableOutput: (output: unknown) => boolean,
    statusTimeoutMs: number,
    apiKeyConfigKey?: string,
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
        if (
          completedWithoutOutputPolls >
          (await this.getCompletedOutputRetryCount())
        ) {
          throw new BadGatewayException(
            `RunPod job ${currentJob.id} completed without output after ${completedWithoutOutputPolls} status checks`,
          );
        }

        await this.sleep(await this.getCompletedOutputRetryDelayMs());
        currentJob = await this.fetchJobStatus(
          endpointId,
          currentJob.id,
          apiKeyConfigKey,
        );
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

      if (Date.now() - startedAt >= statusTimeoutMs) {
        throw new GatewayTimeoutException(
          `RunPod job ${currentJob.id} did not finish within ${statusTimeoutMs}ms`,
        );
      }

      await this.sleep(await this.getPollIntervalMs());
      currentJob = await this.fetchJobStatus(
        endpointId,
        currentJob.id,
        apiKeyConfigKey,
      );
    }
  }

  async fetchJobStatus(
    endpointId: string,
    jobId: string,
    apiKeyConfigKey?: string,
  ): Promise<RunpodJobResponse> {
    const [apiBaseUrl, headers, timeout] = await Promise.all([
      this.getApiBaseUrl(),
      this.getHeaders(apiKeyConfigKey),
      this.getRequestTimeoutMs(),
    ]);
    const response = await axios.get<RunpodJobResponse>(
      `${apiBaseUrl}/${endpointId}/status/${jobId}`,
      {
        headers,
        timeout,
        maxContentLength: RUNPOD_JOB_RESPONSE_MAX_BYTES,
      },
    );

    return response.data;
  }

  /**
   * Download a remote asset (e.g. a media proxy image URL) as raw bytes. Callers normalise and
   * encode it (e.g. EXIF-orient + base64) before inlining as an `image_b64` worker input.
   */
  async fetchBinary(url: string): Promise<Buffer> {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: await this.getRequestTimeoutMs(),
    });

    return Buffer.from(response.data);
  }

  private async getApiBaseUrl(): Promise<string> {
    return (
      (await this.providerRuntimeConfigService.getString(
        'RUNPOD_API_BASE_URL',
      )) || 'https://api.runpod.ai/v2'
    );
  }

  private async getHeaders(apiKeyConfigKey: string = 'RUNPOD_API_KEY') {
    return {
      Authorization: `Bearer ${await this.getRequiredConfig(apiKeyConfigKey)}`,
      'Content-Type': 'application/json',
    };
  }

  private async getRequiredConfig(key: string): Promise<string> {
    const value = await this.providerRuntimeConfigService.getString(key);

    if (!value) {
      throw new Error(`${key} is not configured`);
    }

    return value;
  }

  private async getPollIntervalMs(): Promise<number> {
    return (
      (await this.providerRuntimeConfigService.getNumber(
        'RUNPOD_POLL_INTERVAL_MS',
      )) ?? 5000
    );
  }

  private async getRequestTimeoutMs(): Promise<number> {
    return (
      (await this.providerRuntimeConfigService.getNumber(
        'RUNPOD_REQUEST_TIMEOUT_MS',
      )) ?? 30000
    );
  }

  private async getCompletedOutputRetryCount(): Promise<number> {
    return (
      (await this.providerRuntimeConfigService.getNumber(
        'RUNPOD_COMPLETED_OUTPUT_RETRY_COUNT',
      )) ?? 6
    );
  }

  private async getCompletedOutputRetryDelayMs(): Promise<number> {
    return (
      (await this.providerRuntimeConfigService.getNumber(
        'RUNPOD_COMPLETED_OUTPUT_RETRY_DELAY_MS',
      )) ?? 2000
    );
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
