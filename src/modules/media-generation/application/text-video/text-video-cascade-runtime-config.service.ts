import { Injectable } from '@nestjs/common';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';
import {
  prunaPImageClientPolicySha256,
  resolvePrunaPImageClientPolicy,
} from 'src/modules/media-generation/infrastructure/providers/pruna/pruna-p-image.client';
import {
  LTX_TEXT_CASCADE_RUNPOD_API_KEY_CONFIG_KEY,
  TEXT_VIDEO_CASCADE_DEFAULTS,
  TEXT_VIDEO_CASCADE_SETTING_KEYS,
  TextVideoCascadeRuntimeSnapshot,
} from 'src/modules/media-generation/domain/contracts/text-video-cascade-settings.contract';
import {
  PrunaPImageClientConfig,
  ResolvedPrunaPImageClientPolicy,
} from 'src/modules/media-generation/infrastructure/providers/pruna/pruna-p-image.types';

const VERSION_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const RUNPOD_ENDPOINT_PATTERN = /^[A-Za-z0-9_-]{3,128}$/;
const UNCONFIGURED_CASCADE_ENDPOINT = 'unconfigured';
const MAX_OPERATION_TIMEOUT_MS = 7_200_000;

@Injectable()
export class TextVideoCascadeRuntimeConfigService {
  constructor(
    private readonly providerRuntimeConfigService: ProviderRuntimeConfigService,
  ) {}

  async getRuntimeSnapshot(): Promise<TextVideoCascadeRuntimeSnapshot> {
    const keys = TEXT_VIDEO_CASCADE_SETTING_KEYS;
    const defaults = TEXT_VIDEO_CASCADE_DEFAULTS;
    const [
      enabled,
      prunaClientPolicy,
      promptCompilerVersion,
      stillQcEnabled,
      stillQcPolicyVersion,
      videoQcEnabled,
      videoQcPolicyVersion,
      artifactTtlMs,
      stillPollIntervalMs,
      stillTotalTimeoutMs,
      i2vPollIntervalMs,
      i2vTotalTimeoutMs,
      cascadeRunpodEndpointId,
      cascadeRunpodApiKey,
      nativeRunpodEndpointId,
      prunaEnabled,
      prunaModel,
    ] = await Promise.all([
      this.providerRuntimeConfigService.getBoolean(keys.enabled, false),
      this.getPrunaClientPolicy(),
      this.providerRuntimeConfigService.getString(keys.promptCompilerVersion),
      this.providerRuntimeConfigService.getBoolean(keys.stillQcEnabled, false),
      this.providerRuntimeConfigService.getString(keys.stillQcPolicyVersion),
      this.providerRuntimeConfigService.getBoolean(keys.videoQcEnabled, false),
      this.providerRuntimeConfigService.getString(keys.videoQcPolicyVersion),
      this.providerRuntimeConfigService.getNumber(
        keys.artifactTtlMs,
        defaults.artifactTtlMs,
      ),
      this.providerRuntimeConfigService.getNumber(
        keys.stillPollIntervalMs,
        defaults.stillPollIntervalMs,
      ),
      this.providerRuntimeConfigService.getNumber(
        keys.stillTotalTimeoutMs,
        defaults.stillTotalTimeoutMs,
      ),
      this.providerRuntimeConfigService.getNumber(
        keys.i2vPollIntervalMs,
        defaults.i2vPollIntervalMs,
      ),
      this.providerRuntimeConfigService.getNumber(
        keys.i2vTotalTimeoutMs,
        defaults.i2vTotalTimeoutMs,
      ),
      this.providerRuntimeConfigService.getStringFresh(
        keys.cascadeRunpodEndpointId,
      ),
      this.providerRuntimeConfigService.getStringFresh(
        keys.cascadeRunpodApiKey,
      ),
      this.providerRuntimeConfigService.getStringFresh(
        'RUNPOD_P_VIDEO_ENDPOINT_ID',
      ),
      this.providerRuntimeConfigService.getBoolean(keys.prunaEnabled, false),
      this.providerRuntimeConfigService.getString(keys.prunaModel),
    ]);

    const snapshot: TextVideoCascadeRuntimeSnapshot = {
      enabled,
      pipelineConfigVersion: prunaClientPolicy.pipelineConfigVersion,
      promptCompilerVersion:
        promptCompilerVersion ?? defaults.promptCompilerVersion,
      stillQcEnabled,
      stillQcPolicyVersion:
        stillQcPolicyVersion ?? defaults.stillQcPolicyVersion,
      videoQcEnabled,
      videoQcPolicyVersion:
        videoQcPolicyVersion ?? defaults.videoQcPolicyVersion,
      artifactTtlMs: boundedPositive(
        artifactTtlMs,
        defaults.artifactTtlMs,
        30 * 86_400_000,
      ),
      stillPollIntervalMs: boundedPositive(
        stillPollIntervalMs,
        defaults.stillPollIntervalMs,
        60_000,
      ),
      stillTotalTimeoutMs: boundedPositive(
        stillTotalTimeoutMs,
        defaults.stillTotalTimeoutMs,
        MAX_OPERATION_TIMEOUT_MS,
      ),
      i2vPollIntervalMs: boundedPositive(
        i2vPollIntervalMs,
        defaults.i2vPollIntervalMs,
        60_000,
      ),
      i2vTotalTimeoutMs: boundedPositive(
        i2vTotalTimeoutMs,
        defaults.i2vTotalTimeoutMs,
        MAX_OPERATION_TIMEOUT_MS,
      ),
      cascadeRunpodEndpointId: RUNPOD_ENDPOINT_PATTERN.test(
        cascadeRunpodEndpointId ?? '',
      )
        ? cascadeRunpodEndpointId!
        : UNCONFIGURED_CASCADE_ENDPOINT,
      cascadeRunpodApiKeyConfigKey: LTX_TEXT_CASCADE_RUNPOD_API_KEY_CONFIG_KEY,
      cascadeRunpodReady:
        RUNPOD_ENDPOINT_PATTERN.test(cascadeRunpodEndpointId ?? '') &&
        RUNPOD_ENDPOINT_PATTERN.test(nativeRunpodEndpointId ?? '') &&
        cascadeRunpodEndpointId !== nativeRunpodEndpointId &&
        Boolean(cascadeRunpodApiKey),
      prunaEnabled,
      prunaModel:
        prunaModel === 'p-image'
          ? 'p-image'
          : TEXT_VIDEO_CASCADE_DEFAULTS.prunaModel,
      prunaClientPolicySha256: prunaPImageClientPolicySha256(prunaClientPolicy),
    };
    validateVersions(snapshot);
    return snapshot;
  }

  async getPrunaClientConfig(): Promise<PrunaPImageClientConfig> {
    const [apiKey, policy] = await Promise.all([
      this.providerRuntimeConfigService.getString(
        TEXT_VIDEO_CASCADE_SETTING_KEYS.prunaApiKey,
      ),
      this.getPrunaClientPolicy(),
    ]);

    if (!apiKey) {
      throw new TextVideoCascadeConfigError('PRUNA_NOT_CONFIGURED');
    }
    return {
      apiKey,
      ...policy,
    };
  }

  async getPrunaClientPolicy(): Promise<ResolvedPrunaPImageClientPolicy> {
    const keys = TEXT_VIDEO_CASCADE_SETTING_KEYS;
    const defaults = TEXT_VIDEO_CASCADE_DEFAULTS;
    const [
      pipelineConfigVersion,
      apiBaseUrl,
      allowedHosts,
      submitTimeoutMs,
      statusRequestTimeoutMs,
      downloadTimeoutMs,
      maxSourceJpegBytes,
    ] = await Promise.all([
      this.providerRuntimeConfigService.getString(keys.pipelineConfigVersion),
      this.providerRuntimeConfigService.getString(keys.prunaApiBaseUrl),
      this.providerRuntimeConfigService.getString(
        keys.prunaAllowedDownloadHosts,
      ),
      this.providerRuntimeConfigService.getNumber(
        keys.prunaSubmitTimeoutMs,
        defaults.prunaSubmitTimeoutMs,
      ),
      this.providerRuntimeConfigService.getNumber(
        keys.prunaStatusRequestTimeoutMs,
        defaults.prunaStatusRequestTimeoutMs,
      ),
      this.providerRuntimeConfigService.getNumber(
        keys.prunaDownloadTimeoutMs,
        defaults.prunaDownloadTimeoutMs,
      ),
      this.providerRuntimeConfigService.getNumber(
        keys.prunaMaxSourceBytes,
        defaults.prunaMaxSourceBytes,
      ),
    ]);
    return resolvePrunaPImageClientPolicy({
      pipelineConfigVersion:
        pipelineConfigVersion ?? defaults.pipelineConfigVersion,
      apiBaseUrl: apiBaseUrl ?? defaults.prunaApiBaseUrl,
      allowedDownloadHosts: parseHostList(allowedHosts),
      submitTimeoutMs,
      statusRequestTimeoutMs,
      downloadTimeoutMs,
      maxSourceJpegBytes,
    });
  }
}

export class TextVideoCascadeConfigError extends Error {
  constructor(
    readonly reasonCode: 'LTX_CASCADE_CONFIG_INVALID' | 'PRUNA_NOT_CONFIGURED',
  ) {
    super(reasonCode);
    this.name = 'TextVideoCascadeConfigError';
  }

  toJSON(): { reasonCode: string } {
    return { reasonCode: this.reasonCode };
  }
}

function validateVersions(snapshot: TextVideoCascadeRuntimeSnapshot): void {
  if (
    !VERSION_PATTERN.test(snapshot.pipelineConfigVersion) ||
    !VERSION_PATTERN.test(snapshot.promptCompilerVersion) ||
    !VERSION_PATTERN.test(snapshot.stillQcPolicyVersion) ||
    !VERSION_PATTERN.test(snapshot.videoQcPolicyVersion)
  ) {
    throw new TextVideoCascadeConfigError('LTX_CASCADE_CONFIG_INVALID');
  }
}

function boundedPositive(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  if (
    value === undefined ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > maximum
  ) {
    return fallback;
  }
  return value;
}

function parseHostList(value: string | null): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}
