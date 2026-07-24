export const LTX_TEXT_CASCADE_RUNPOD_API_KEY_CONFIG_KEY =
  'LTX_TEXT_CASCADE_RUNPOD_API_KEY' as const;

export const TEXT_VIDEO_CASCADE_SETTING_KEYS = {
  enabled: 'LTX_TEXT_CASCADE_ENABLED',
  pipelineConfigVersion: 'LTX_TEXT_CASCADE_CONFIG_VERSION',
  promptCompilerVersion: 'LTX_TEXT_CASCADE_PROMPT_COMPILER_VERSION',
  stillQcEnabled: 'LTX_TEXT_CASCADE_STILL_QC_ENABLED',
  stillQcPolicyVersion: 'LTX_TEXT_CASCADE_STILL_QC_POLICY_VERSION',
  videoQcEnabled: 'LTX_TEXT_CASCADE_VIDEO_QC_ENABLED',
  videoQcPolicyVersion: 'LTX_TEXT_CASCADE_VIDEO_QC_POLICY_VERSION',
  artifactTtlMs: 'LTX_TEXT_CASCADE_ARTIFACT_TTL_MS',
  stillPollIntervalMs: 'LTX_TEXT_CASCADE_STILL_POLL_INTERVAL_MS',
  stillTotalTimeoutMs: 'LTX_TEXT_CASCADE_STILL_TOTAL_TIMEOUT_MS',
  i2vPollIntervalMs: 'LTX_TEXT_CASCADE_I2V_POLL_INTERVAL_MS',
  i2vTotalTimeoutMs: 'LTX_TEXT_CASCADE_I2V_TOTAL_TIMEOUT_MS',
  cascadeRunpodEndpointId: 'LTX_TEXT_CASCADE_RUNPOD_ENDPOINT_ID',
  cascadeRunpodApiKey: LTX_TEXT_CASCADE_RUNPOD_API_KEY_CONFIG_KEY,
  prunaApiKey: 'PRUNA_API_KEY',
  prunaApiBaseUrl: 'PRUNA_API_BASE_URL',
  prunaEnabled: 'PRUNA_P_IMAGE_ENABLED',
  prunaModel: 'PRUNA_P_IMAGE_MODEL',
  prunaSubmitTimeoutMs: 'PRUNA_P_IMAGE_SUBMIT_TIMEOUT_MS',
  prunaStatusRequestTimeoutMs: 'PRUNA_P_IMAGE_STATUS_REQUEST_TIMEOUT_MS',
  prunaDownloadTimeoutMs: 'PRUNA_P_IMAGE_DOWNLOAD_TIMEOUT_MS',
  prunaMaxSourceBytes: 'PRUNA_P_IMAGE_MAX_SOURCE_BYTES',
  prunaAllowedDownloadHosts: 'PRUNA_P_IMAGE_ALLOWED_DOWNLOAD_HOSTS',
} as const;

export const TEXT_VIDEO_CASCADE_DEFAULTS = {
  enabled: false,
  pipelineConfigVersion: 'cascade-disabled-v1',
  promptCompilerVersion: 'verbatim-v1',
  stillQcEnabled: false,
  stillQcPolicyVersion: 'still-qc-disabled-v1',
  videoQcEnabled: false,
  videoQcPolicyVersion: 'video-qc-disabled-v1',
  artifactTtlMs: 86_400_000,
  stillPollIntervalMs: 1_000,
  stillTotalTimeoutMs: 30_000,
  i2vPollIntervalMs: 5_000,
  i2vTotalTimeoutMs: 7_200_000,
  prunaApiBaseUrl: 'https://api.pruna.ai',
  prunaEnabled: false,
  prunaModel: 'p-image',
  prunaSubmitTimeoutMs: 10_000,
  prunaStatusRequestTimeoutMs: 5_000,
  prunaDownloadTimeoutMs: 10_000,
  prunaMaxSourceBytes: 6 * 1024 * 1024,
} as const;

export interface TextVideoCascadeRuntimeSnapshot {
  enabled: boolean;
  pipelineConfigVersion: string;
  promptCompilerVersion: string;
  stillQcEnabled: boolean;
  stillQcPolicyVersion: string;
  videoQcEnabled: boolean;
  videoQcPolicyVersion: string;
  artifactTtlMs: number;
  stillPollIntervalMs: number;
  stillTotalTimeoutMs: number;
  i2vPollIntervalMs: number;
  i2vTotalTimeoutMs: number;
  cascadeRunpodEndpointId: string;
  cascadeRunpodApiKeyConfigKey: typeof LTX_TEXT_CASCADE_RUNPOD_API_KEY_CONFIG_KEY;
  cascadeRunpodReady: boolean;
  prunaEnabled: boolean;
  prunaModel: 'p-image';
  prunaClientPolicySha256: string;
}
