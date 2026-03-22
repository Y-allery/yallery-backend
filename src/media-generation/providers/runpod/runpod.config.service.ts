import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from 'src/config/env.validation';
import {
  RUNPOD_API_BASE_URL,
  RUNPOD_DEFAULT_EXECUTION_TIMEOUT_MS,
  RUNPOD_DEFAULT_POLL_INTERVAL_MS,
  RUNPOD_DEFAULT_REQUEST_TIMEOUT_MS,
  RUNPOD_DEFAULT_TTL_MS,
  RunpodEndpointType,
} from './runpod.constants';
import { RunpodExecutionPolicy } from './runpod.types';

@Injectable()
export class RunpodConfigService {
  constructor(
    private readonly configService: ConfigService<EnvironmentVariables>,
  ) {}

  isEnabled(endpointType?: RunpodEndpointType): boolean {
    const apiKey = this.configService.get<string>('RUNPOD_API_KEY');
    if (!apiKey) {
      return false;
    }

    if (!endpointType) {
      return true;
    }

    return !!this.getEndpointId(endpointType);
  }

  getApiKeyOrThrow(): string {
    const apiKey = this.configService.get<string>('RUNPOD_API_KEY')?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException('RUNPOD_API_KEY is not configured');
    }

    return apiKey;
  }

  getBaseUrl(): string {
    const baseUrl =
      this.configService.get<string>('RUNPOD_API_URL') || RUNPOD_API_BASE_URL;

    return baseUrl.replace(/\/+$/, '');
  }

  getRequestTimeoutMs(): number {
    return (
      this.configService.get<number>('RUNPOD_REQUEST_TIMEOUT_MS') ??
      RUNPOD_DEFAULT_REQUEST_TIMEOUT_MS
    );
  }

  getPollIntervalMs(): number {
    return (
      this.configService.get<number>('RUNPOD_POLL_INTERVAL_MS') ??
      RUNPOD_DEFAULT_POLL_INTERVAL_MS
    );
  }

  getDefaultPolicy(): RunpodExecutionPolicy {
    return {
      executionTimeout:
        this.configService.get<number>('RUNPOD_DEFAULT_EXECUTION_TIMEOUT_MS') ??
        RUNPOD_DEFAULT_EXECUTION_TIMEOUT_MS,
      ttl:
        this.configService.get<number>('RUNPOD_DEFAULT_TTL_MS') ??
        RUNPOD_DEFAULT_TTL_MS,
    };
  }

  getImageModel(): string | undefined {
    return this.configService.get<string>('RUNPOD_IMAGE_MODEL')?.trim();
  }

  getEndpointId(endpointType: RunpodEndpointType): string | undefined {
    switch (endpointType) {
      case RunpodEndpointType.IMAGE:
        return this.configService.get<string>('RUNPOD_IMAGE_ENDPOINT_ID');
      case RunpodEndpointType.IMAGE_EDIT:
        return this.configService.get<string>('RUNPOD_IMAGE_EDIT_ENDPOINT_ID');
      case RunpodEndpointType.VIDEO:
        return this.configService.get<string>('RUNPOD_VIDEO_ENDPOINT_ID');
      case RunpodEndpointType.AUDIO:
        return this.configService.get<string>('RUNPOD_AUDIO_ENDPOINT_ID');
      default:
        return undefined;
    }
  }

  getEndpointIdOrThrow(endpointType: RunpodEndpointType): string {
    const endpointId = this.getEndpointId(endpointType);
    if (!endpointId) {
      throw new ServiceUnavailableException(
        `RunPod endpoint is not configured for ${endpointType}`,
      );
    }

    return endpointId;
  }
}
