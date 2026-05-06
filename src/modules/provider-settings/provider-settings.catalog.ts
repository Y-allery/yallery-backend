import { RUNPOD_MEDIA_ROUTE_CATALOG } from 'src/modules/media-generation/infrastructure/routing/media-route.catalog';

export type ProviderSettingGroup =
  | 'openai'
  | 'runpod_core'
  | 'runpod_private_endpoints'
  | 'runpod_public_endpoints'
  | 'runpod_toggles'
  | 'runpod_timeouts';

export type ProviderSettingValueType = 'secret' | 'string' | 'boolean' | 'number';

export type ProviderSettingValidationKind =
  | 'openai_api_key'
  | 'runpod_serverless_endpoint'
  | 'runpod_public_endpoint'
  | 'none';

export interface ProviderSettingDefinition {
  key: string;
  provider: 'openai' | 'runpod';
  group: ProviderSettingGroup;
  label: string;
  description?: string;
  type: ProviderSettingValueType;
  isSecret: boolean;
  validationKind: ProviderSettingValidationKind;
  defaultValue?: string;
}

const RUNPOD_STATUS_TIMEOUT_SETTING_DEFINITIONS: ProviderSettingDefinition[] =
  RUNPOD_MEDIA_ROUTE_CATALOG.filter(
    (
      route,
    ): route is typeof route & {
      statusTimeoutConfigKey: string;
      statusTimeoutLabel: string;
      defaultStatusTimeoutMs: number;
    } =>
      Boolean(
        route.statusTimeoutConfigKey &&
          route.statusTimeoutLabel &&
          route.defaultStatusTimeoutMs !== undefined,
      ),
  ).map((route) => ({
    key: route.statusTimeoutConfigKey,
    provider: 'runpod',
    group: 'runpod_timeouts',
    label: route.statusTimeoutLabel,
    type: 'number',
    isSecret: false,
    validationKind: 'none',
    defaultValue: String(route.defaultStatusTimeoutMs),
  }));

export const PROVIDER_SETTING_DEFINITIONS: ProviderSettingDefinition[] = [
  {
    key: 'OPENAI_API_KEY',
    provider: 'openai',
    group: 'openai',
    label: 'OpenAI API Key',
    type: 'secret',
    isSecret: true,
    validationKind: 'openai_api_key',
  },
  {
    key: 'RUNPOD_API_KEY',
    provider: 'runpod',
    group: 'runpod_core',
    label: 'RunPod API Key',
    type: 'secret',
    isSecret: true,
    validationKind: 'none',
  },
  {
    key: 'RUNPOD_API_BASE_URL',
    provider: 'runpod',
    group: 'runpod_core',
    label: 'RunPod API Base URL',
    type: 'string',
    isSecret: false,
    validationKind: 'none',
    defaultValue: 'https://api.runpod.ai/v2',
  },
  {
    key: 'RUNPOD_FLUX2_KLEIN_ENDPOINT_ID',
    provider: 'runpod',
    group: 'runpod_private_endpoints',
    label: 'Flux 2 Klein Endpoint',
    type: 'string',
    isSecret: false,
    validationKind: 'runpod_serverless_endpoint',
  },
  {
    key: 'RUNPOD_SDXL_ENDPOINT_ID',
    provider: 'runpod',
    group: 'runpod_private_endpoints',
    label: 'SDXL Endpoint',
    type: 'string',
    isSecret: false,
    validationKind: 'runpod_serverless_endpoint',
  },
  {
    key: 'RUNPOD_SDXL_LORA_FINETUNE_ENDPOINT_ID',
    provider: 'runpod',
    group: 'runpod_private_endpoints',
    label: 'SDXL LoRA Finetune Endpoint',
    type: 'string',
    isSecret: false,
    validationKind: 'runpod_serverless_endpoint',
  },
  {
    key: 'RUNPOD_SDXL_LORA_GENERATION_ENDPOINT_ID',
    provider: 'runpod',
    group: 'runpod_private_endpoints',
    label: 'SDXL LoRA Generation Endpoint',
    type: 'string',
    isSecret: false,
    validationKind: 'runpod_serverless_endpoint',
  },
  {
    key: 'RUNPOD_QWEN_IMAGE_EDIT_BAKED_ENDPOINT_ID',
    provider: 'runpod',
    group: 'runpod_private_endpoints',
    label: 'Qwen Image Edit Endpoint',
    type: 'string',
    isSecret: false,
    validationKind: 'runpod_serverless_endpoint',
  },
  {
    key: 'RUNPOD_MMAUDIO_ENDPOINT_ID',
    provider: 'runpod',
    group: 'runpod_private_endpoints',
    label: 'MMAudio Endpoint',
    type: 'string',
    isSecret: false,
    validationKind: 'runpod_serverless_endpoint',
  },
  {
    key: 'RUNPOD_WAN22_ANIMATE_MEME_ENDPOINT_ID',
    provider: 'runpod',
    group: 'runpod_private_endpoints',
    label: 'WAN 2.2 Animate Meme Endpoint',
    type: 'string',
    isSecret: false,
    validationKind: 'runpod_serverless_endpoint',
  },
  {
    key: 'RUNPOD_P_VIDEO_ENDPOINT_ID',
    provider: 'runpod',
    group: 'runpod_public_endpoints',
    label: 'P-Video Public Endpoint',
    description: 'Public/logical RunPod endpoint identifier; not a serverless control-plane endpoint id.',
    type: 'string',
    isSecret: false,
    validationKind: 'runpod_public_endpoint',
  },
  {
    key: 'RUNPOD_FLUX2_KLEIN_ENABLED',
    provider: 'runpod',
    group: 'runpod_toggles',
    label: 'Flux 2 Klein Enabled',
    type: 'boolean',
    isSecret: false,
    validationKind: 'none',
    defaultValue: 'true',
  },
  {
    key: 'RUNPOD_SDXL_ENABLED',
    provider: 'runpod',
    group: 'runpod_toggles',
    label: 'SDXL Enabled',
    type: 'boolean',
    isSecret: false,
    validationKind: 'none',
    defaultValue: 'true',
  },
  {
    key: 'RUNPOD_SDXL_LORA_GENERATION_ENABLED',
    provider: 'runpod',
    group: 'runpod_toggles',
    label: 'SDXL LoRA Generation Enabled',
    type: 'boolean',
    isSecret: false,
    validationKind: 'none',
    defaultValue: 'true',
  },
  {
    key: 'RUNPOD_QWEN_IMAGE_EDIT_BAKED_ENABLED',
    provider: 'runpod',
    group: 'runpod_toggles',
    label: 'Qwen Image Edit Enabled',
    type: 'boolean',
    isSecret: false,
    validationKind: 'none',
    defaultValue: 'true',
  },
  {
    key: 'RUNPOD_MMAUDIO_ENABLED',
    provider: 'runpod',
    group: 'runpod_toggles',
    label: 'MMAudio Enabled',
    type: 'boolean',
    isSecret: false,
    validationKind: 'none',
    defaultValue: 'true',
  },
  {
    key: 'RUNPOD_P_VIDEO_ENABLED',
    provider: 'runpod',
    group: 'runpod_toggles',
    label: 'P-Video Enabled',
    type: 'boolean',
    isSecret: false,
    validationKind: 'none',
    defaultValue: 'true',
  },
  {
    key: 'RUNPOD_WAN22_ANIMATE_MEME_ENABLED',
    provider: 'runpod',
    group: 'runpod_toggles',
    label: 'WAN 2.2 Animate Meme Enabled',
    type: 'boolean',
    isSecret: false,
    validationKind: 'none',
    defaultValue: 'true',
  },
  ...RUNPOD_STATUS_TIMEOUT_SETTING_DEFINITIONS,
  {
    key: 'RUNPOD_POLL_INTERVAL_MS',
    provider: 'runpod',
    group: 'runpod_timeouts',
    label: 'Poll Interval',
    type: 'number',
    isSecret: false,
    validationKind: 'none',
    defaultValue: '5000',
  },
  {
    key: 'RUNPOD_REQUEST_TIMEOUT_MS',
    provider: 'runpod',
    group: 'runpod_timeouts',
    label: 'Request Timeout',
    type: 'number',
    isSecret: false,
    validationKind: 'none',
    defaultValue: '30000',
  },
  {
    key: 'RUNPOD_SYNC_REQUEST_TIMEOUT_MS',
    provider: 'runpod',
    group: 'runpod_timeouts',
    label: 'Sync Request Timeout',
    type: 'number',
    isSecret: false,
    validationKind: 'none',
    defaultValue: '1800000',
  },
  {
    key: 'RUNPOD_COMPLETED_OUTPUT_RETRY_COUNT',
    provider: 'runpod',
    group: 'runpod_timeouts',
    label: 'Completed Output Retry Count',
    type: 'number',
    isSecret: false,
    validationKind: 'none',
    defaultValue: '6',
  },
  {
    key: 'RUNPOD_COMPLETED_OUTPUT_RETRY_DELAY_MS',
    provider: 'runpod',
    group: 'runpod_timeouts',
    label: 'Completed Output Retry Delay',
    type: 'number',
    isSecret: false,
    validationKind: 'none',
    defaultValue: '2000',
  },
];

export const PROVIDER_SETTING_DEFINITION_BY_KEY = new Map(
  PROVIDER_SETTING_DEFINITIONS.map((definition) => [definition.key, definition]),
);
