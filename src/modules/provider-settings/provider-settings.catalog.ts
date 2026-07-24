import { RUNPOD_MEDIA_ROUTE_CATALOG } from 'src/modules/media-generation/infrastructure/routing/media-route.catalog';
import {
  DEFAULT_LTX_TEXT_PIPELINE_MODE,
  LTX_TEXT_PIPELINE_MODES,
  LTX_TEXT_PIPELINE_MODE_SETTING_KEY,
} from 'src/modules/media-generation/domain/contracts/ltx-text-pipeline-mode.contract';
import {
  TEXT_VIDEO_CASCADE_DEFAULTS,
  TEXT_VIDEO_CASCADE_SETTING_KEYS,
} from 'src/modules/media-generation/domain/contracts/text-video-cascade-settings.contract';
import {
  REFERRAL_REWARD_DEFAULTS,
  REFERRAL_REWARD_SETTING_KEYS,
} from 'src/modules/users/referral/referral-reward.contract';

export type ProviderSettingGroup =
  | 'openai'
  | 'runpod_core'
  | 'runpod_private_endpoints'
  | 'runpod_public_endpoints'
  | 'runpod_toggles'
  | 'runpod_timeouts'
  | 'pruna'
  | 'media_defaults'
  | 'content_bot'
  | 'ops'
  | 'payments'
  | 'referrals';

export type ProviderSettingValueType =
  | 'secret'
  | 'string'
  | 'boolean'
  | 'number';

export type ProviderSettingValidationKind =
  | 'openai_api_key'
  | 'runpod_serverless_endpoint'
  | 'runpod_public_endpoint'
  | 'none';

export interface ProviderSettingDefinition {
  key: string;
  /** 'app' covers settings that are not tied to an external provider. */
  provider: 'openai' | 'runpod' | 'pruna' | 'app' | 'adapty';
  group: ProviderSettingGroup;
  label: string;
  description?: string;
  type: ProviderSettingValueType;
  isSecret: boolean;
  validationKind: ProviderSettingValidationKind;
  defaultValue?: string;
  /** Optional allow-list applied to normalized non-secret string values. */
  allowedValues?: readonly string[];
  /** Override for validating an endpoint hosted in a separate RunPod account. */
  apiKeyConfigKey?: string;
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
    key: 'OPENAI_TRANSLATION_MODEL',
    provider: 'openai',
    group: 'openai',
    label: 'OpenAI model for content auto-translation',
    type: 'string',
    isSecret: false,
    validationKind: 'none',
    defaultValue: 'gpt-4o-mini',
  },
  {
    key: 'OPENAI_TAGGING_MODEL',
    provider: 'openai',
    group: 'openai',
    label: 'OpenAI model for auto-tag resolution',
    type: 'string',
    isSecret: false,
    validationKind: 'none',
    defaultValue: 'gpt-4o-mini',
  },
  {
    key: 'OPENAI_MODERATION_MODEL',
    provider: 'openai',
    group: 'openai',
    label: 'OpenAI moderation model for Krea image safety',
    description:
      'Fail-closed prompt and generated-image moderation for Krea 2 routes.',
    type: 'string',
    isSecret: false,
    validationKind: 'none',
    defaultValue: 'omni-moderation-latest',
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
    key: 'RUNPOD_VIDEO_API_KEY',
    provider: 'runpod',
    group: 'runpod_core',
    label: 'RunPod Video API Key (2nd account)',
    description:
      'API key for the second RunPod account that hosts the LTX video endpoint. Required for video routes; the main RUNPOD_API_KEY does not authenticate against that account.',
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
    key: 'RUNPOD_QWEN_IMAGE_ENDPOINT_ID',
    provider: 'runpod',
    group: 'runpod_private_endpoints',
    label: 'Qwen Image (t2i) Endpoint — account #2',
    type: 'string',
    isSecret: false,
    validationKind: 'runpod_serverless_endpoint',
  },
  {
    // 2026-07-24 t2i battery candidate C. See workers/out/t2i-battery-2026-07-24/RUNBOOK.md.
    key: 'RUNPOD_QWEN_IMAGE_2512_ENDPOINT_ID',
    provider: 'runpod',
    group: 'runpod_private_endpoints',
    label: 'Qwen Image 2512 (t2i) Endpoint — account #2',
    type: 'string',
    isSecret: false,
    validationKind: 'runpod_serverless_endpoint',
  },
  {
    // 2026-07-24 t2i battery candidate D. See workers/out/t2i-battery-2026-07-24/RUNBOOK.md.
    key: 'RUNPOD_Z_IMAGE_TURBO_ENDPOINT_ID',
    provider: 'runpod',
    group: 'runpod_private_endpoints',
    label: 'Z-Image Turbo (t2i) Endpoint — account #2',
    type: 'string',
    isSecret: false,
    validationKind: 'runpod_serverless_endpoint',
  },
  {
    key: 'RUNPOD_KREA2_TURBO_ENDPOINT_ID',
    provider: 'runpod',
    group: 'runpod_private_endpoints',
    label: 'Krea 2 Turbo Endpoint',
    description:
      'Regular Krea 2 Turbo prompt-to-image generation endpoint on the main RunPod account.',
    type: 'string',
    isSecret: false,
    validationKind: 'runpod_serverless_endpoint',
  },
  {
    key: 'RUNPOD_KREA2_LORA_FINETUNE_ENDPOINT_ID',
    provider: 'runpod',
    group: 'runpod_private_endpoints',
    label: 'Krea 2 LoRA Finetune Endpoint',
    description:
      'Krea-2-Raw LoRA training endpoint on the main RunPod account.',
    type: 'string',
    isSecret: false,
    validationKind: 'runpod_serverless_endpoint',
  },
  {
    key: 'RUNPOD_KREA2_LORA_GENERATION_ENDPOINT_ID',
    provider: 'runpod',
    group: 'runpod_private_endpoints',
    label: 'Krea 2 LoRA Generation Endpoint',
    description:
      'Krea 2 Turbo generation endpoint that loads contest LoRA artifacts trained from Krea-2-Raw.',
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
    description:
      'Public/logical RunPod endpoint identifier; not a serverless control-plane endpoint id.',
    type: 'string',
    isSecret: false,
    validationKind: 'runpod_public_endpoint',
  },
  {
    key: 'RUNPOD_LTX_MEME_ENDPOINT_ID',
    provider: 'runpod',
    group: 'runpod_public_endpoints',
    label: 'LTX Meme Endpoint (2nd account)',
    description:
      'Serverless endpoint for the LTX meme motion-control worker (v8.20+, LTX_MEME=1 + Union IC-LoRA). Authenticates with RUNPOD_VIDEO_API_KEY.',
    type: 'string',
    isSecret: false,
    validationKind: 'runpod_public_endpoint',
  },
  {
    key: LTX_TEXT_PIPELINE_MODE_SETTING_KEY,
    provider: 'app',
    group: 'media_defaults',
    label: 'LTX text pipeline mode',
    description:
      'Global enqueue-time mode for text-to-video. Native is the safe default; cascade is fail-closed until its workflow is explicitly wired. Existing jobs retain their snapshotted mode.',
    type: 'string',
    isSecret: false,
    validationKind: 'none',
    defaultValue: DEFAULT_LTX_TEXT_PIPELINE_MODE,
    allowedValues: LTX_TEXT_PIPELINE_MODES,
  },
  {
    key: TEXT_VIDEO_CASCADE_SETTING_KEYS.enabled,
    provider: 'app',
    group: 'media_defaults',
    label: 'LTX text cascade readiness switch',
    description:
      'Defense-in-depth switch. False by default; mode=cascade still fails closed unless this and every private-store/QC dependency are configured.',
    type: 'boolean',
    isSecret: false,
    validationKind: 'none',
    defaultValue: String(TEXT_VIDEO_CASCADE_DEFAULTS.enabled),
  },
  {
    key: TEXT_VIDEO_CASCADE_SETTING_KEYS.pipelineConfigVersion,
    provider: 'app',
    group: 'media_defaults',
    label: 'LTX text cascade config version',
    type: 'string',
    isSecret: false,
    validationKind: 'none',
    defaultValue: TEXT_VIDEO_CASCADE_DEFAULTS.pipelineConfigVersion,
  },
  {
    key: TEXT_VIDEO_CASCADE_SETTING_KEYS.promptCompilerVersion,
    provider: 'app',
    group: 'media_defaults',
    label: 'LTX text cascade prompt compiler version',
    type: 'string',
    isSecret: false,
    validationKind: 'none',
    defaultValue: TEXT_VIDEO_CASCADE_DEFAULTS.promptCompilerVersion,
  },
  {
    key: TEXT_VIDEO_CASCADE_SETTING_KEYS.stillQcEnabled,
    provider: 'app',
    group: 'media_defaults',
    label: 'LTX text cascade still QC enabled',
    type: 'boolean',
    isSecret: false,
    validationKind: 'none',
    defaultValue: String(TEXT_VIDEO_CASCADE_DEFAULTS.stillQcEnabled),
  },
  {
    key: TEXT_VIDEO_CASCADE_SETTING_KEYS.stillQcPolicyVersion,
    provider: 'app',
    group: 'media_defaults',
    label: 'LTX text cascade still QC policy version',
    type: 'string',
    isSecret: false,
    validationKind: 'none',
    defaultValue: TEXT_VIDEO_CASCADE_DEFAULTS.stillQcPolicyVersion,
  },
  {
    key: TEXT_VIDEO_CASCADE_SETTING_KEYS.videoQcEnabled,
    provider: 'app',
    group: 'media_defaults',
    label: 'LTX text cascade video QC enabled',
    type: 'boolean',
    isSecret: false,
    validationKind: 'none',
    defaultValue: String(TEXT_VIDEO_CASCADE_DEFAULTS.videoQcEnabled),
  },
  {
    key: TEXT_VIDEO_CASCADE_SETTING_KEYS.videoQcPolicyVersion,
    provider: 'app',
    group: 'media_defaults',
    label: 'LTX text cascade video QC policy version',
    type: 'string',
    isSecret: false,
    validationKind: 'none',
    defaultValue: TEXT_VIDEO_CASCADE_DEFAULTS.videoQcPolicyVersion,
  },
  {
    key: TEXT_VIDEO_CASCADE_SETTING_KEYS.artifactTtlMs,
    provider: 'app',
    group: 'media_defaults',
    label: 'LTX text cascade private artifact TTL (ms)',
    type: 'number',
    isSecret: false,
    validationKind: 'none',
    defaultValue: String(TEXT_VIDEO_CASCADE_DEFAULTS.artifactTtlMs),
  },
  {
    key: TEXT_VIDEO_CASCADE_SETTING_KEYS.stillPollIntervalMs,
    provider: 'pruna',
    group: 'pruna',
    label: 'Pruna still poll interval (ms)',
    type: 'number',
    isSecret: false,
    validationKind: 'none',
    defaultValue: String(TEXT_VIDEO_CASCADE_DEFAULTS.stillPollIntervalMs),
  },
  {
    key: TEXT_VIDEO_CASCADE_SETTING_KEYS.stillTotalTimeoutMs,
    provider: 'pruna',
    group: 'pruna',
    label: 'Pruna still total timeout (ms)',
    type: 'number',
    isSecret: false,
    validationKind: 'none',
    defaultValue: String(TEXT_VIDEO_CASCADE_DEFAULTS.stillTotalTimeoutMs),
  },
  {
    key: TEXT_VIDEO_CASCADE_SETTING_KEYS.i2vPollIntervalMs,
    provider: 'runpod',
    group: 'runpod_timeouts',
    label: 'LTX cascade I2V poll interval (ms)',
    type: 'number',
    isSecret: false,
    validationKind: 'none',
    defaultValue: String(TEXT_VIDEO_CASCADE_DEFAULTS.i2vPollIntervalMs),
  },
  {
    key: TEXT_VIDEO_CASCADE_SETTING_KEYS.i2vTotalTimeoutMs,
    provider: 'runpod',
    group: 'runpod_timeouts',
    label: 'LTX cascade I2V total timeout (ms)',
    type: 'number',
    isSecret: false,
    validationKind: 'none',
    defaultValue: String(TEXT_VIDEO_CASCADE_DEFAULTS.i2vTotalTimeoutMs),
  },
  {
    key: TEXT_VIDEO_CASCADE_SETTING_KEYS.cascadeRunpodEndpointId,
    provider: 'runpod',
    group: 'runpod_private_endpoints',
    label: 'LTX text cascade I2V endpoint',
    description:
      'Dedicated cascade-only endpoint. It must not equal the native P-Video endpoint; each workflow snapshots this ID before dispatch.',
    type: 'string',
    isSecret: false,
    validationKind: 'runpod_serverless_endpoint',
    apiKeyConfigKey: TEXT_VIDEO_CASCADE_SETTING_KEYS.cascadeRunpodApiKey,
  },
  {
    key: TEXT_VIDEO_CASCADE_SETTING_KEYS.cascadeRunpodApiKey,
    provider: 'runpod',
    group: 'runpod_core',
    label: 'LTX text cascade RunPod API key',
    description:
      'Dedicated credential reference for the isolated cascade endpoint. It never falls back to the native video key.',
    type: 'secret',
    isSecret: true,
    validationKind: 'none',
  },
  {
    key: TEXT_VIDEO_CASCADE_SETTING_KEYS.prunaApiKey,
    provider: 'pruna',
    group: 'pruna',
    label: 'Pruna API key',
    type: 'secret',
    isSecret: true,
    validationKind: 'none',
  },
  {
    key: TEXT_VIDEO_CASCADE_SETTING_KEYS.prunaApiBaseUrl,
    provider: 'pruna',
    group: 'pruna',
    label: 'Pruna API base URL',
    type: 'string',
    isSecret: false,
    validationKind: 'none',
    defaultValue: TEXT_VIDEO_CASCADE_DEFAULTS.prunaApiBaseUrl,
    allowedValues: [TEXT_VIDEO_CASCADE_DEFAULTS.prunaApiBaseUrl],
  },
  {
    key: TEXT_VIDEO_CASCADE_SETTING_KEYS.prunaEnabled,
    provider: 'pruna',
    group: 'pruna',
    label: 'Pruna P-Image enabled for internal cascade',
    type: 'boolean',
    isSecret: false,
    validationKind: 'none',
    defaultValue: String(TEXT_VIDEO_CASCADE_DEFAULTS.prunaEnabled),
  },
  {
    key: TEXT_VIDEO_CASCADE_SETTING_KEYS.prunaModel,
    provider: 'pruna',
    group: 'pruna',
    label: 'Pruna still model',
    type: 'string',
    isSecret: false,
    validationKind: 'none',
    defaultValue: TEXT_VIDEO_CASCADE_DEFAULTS.prunaModel,
    allowedValues: [TEXT_VIDEO_CASCADE_DEFAULTS.prunaModel],
  },
  {
    key: TEXT_VIDEO_CASCADE_SETTING_KEYS.prunaSubmitTimeoutMs,
    provider: 'pruna',
    group: 'pruna',
    label: 'Pruna P-Image submit timeout (ms)',
    type: 'number',
    isSecret: false,
    validationKind: 'none',
    defaultValue: String(TEXT_VIDEO_CASCADE_DEFAULTS.prunaSubmitTimeoutMs),
  },
  {
    key: TEXT_VIDEO_CASCADE_SETTING_KEYS.prunaStatusRequestTimeoutMs,
    provider: 'pruna',
    group: 'pruna',
    label: 'Pruna P-Image status request timeout (ms)',
    type: 'number',
    isSecret: false,
    validationKind: 'none',
    defaultValue: String(
      TEXT_VIDEO_CASCADE_DEFAULTS.prunaStatusRequestTimeoutMs,
    ),
  },
  {
    key: TEXT_VIDEO_CASCADE_SETTING_KEYS.prunaDownloadTimeoutMs,
    provider: 'pruna',
    group: 'pruna',
    label: 'Pruna P-Image download timeout (ms)',
    type: 'number',
    isSecret: false,
    validationKind: 'none',
    defaultValue: String(TEXT_VIDEO_CASCADE_DEFAULTS.prunaDownloadTimeoutMs),
  },
  {
    key: TEXT_VIDEO_CASCADE_SETTING_KEYS.prunaMaxSourceBytes,
    provider: 'pruna',
    group: 'pruna',
    label: 'Pruna P-Image maximum JPEG bytes',
    type: 'number',
    isSecret: false,
    validationKind: 'none',
    defaultValue: String(TEXT_VIDEO_CASCADE_DEFAULTS.prunaMaxSourceBytes),
  },
  {
    key: TEXT_VIDEO_CASCADE_SETTING_KEYS.prunaAllowedDownloadHosts,
    provider: 'pruna',
    group: 'pruna',
    label: 'Pruna exact allowed delivery hosts',
    description:
      'Comma-separated exact HTTPS hosts. Empty by default; wildcards and IP literals are rejected by the client.',
    type: 'string',
    isSecret: false,
    validationKind: 'none',
    defaultValue: '',
  },
  {
    key: 'WS_ACK_DELIVERY_ENABLED',
    provider: 'app',
    group: 'media_defaults',
    label: 'Websocket acknowledged delivery',
    description:
      'Kill-switch for acknowledged websocket delivery. When on, sockets that advertised ack support (handshake query ack=1) are asked to confirm each generation result, and the post is only marked delivered once one confirms; clients that did not advertise support always get a plain emit and are unaffected. Turn off to fall back to fire-and-forget for everyone.',
    type: 'boolean',
    isSecret: false,
    validationKind: 'none',
    defaultValue: 'true',
  },
  {
    key: 'MEME_AI_SERVICE_OVERRIDE',
    provider: 'runpod',
    group: 'runpod_toggles',
    label: 'Meme AI Service Override',
    description:
      'When set (e.g. "ltx_meme"), every incoming meme generation is routed to this ai_service regardless of what the app sends. Requires an ACTIVE media_ai_settings row (capability meme_generate) for that service — pricing is looked up by the overridden service. Empty = app choice (wan22_animate_native).',
    type: 'string',
    isSecret: false,
    validationKind: 'none',
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
    key: 'RUNPOD_QWEN_IMAGE_ENABLED',
    provider: 'runpod',
    group: 'runpod_toggles',
    label: 'Qwen Image (t2i) Enabled',
    type: 'boolean',
    isSecret: false,
    validationKind: 'none',
    defaultValue: 'true',
  },
  {
    // 2026-07-24 t2i battery candidate C. Dark by default -- flip only after the morning
    // battery pick. See workers/out/t2i-battery-2026-07-24/RUNBOOK.md.
    key: 'RUNPOD_QWEN_IMAGE_2512_ENABLED',
    provider: 'runpod',
    group: 'runpod_toggles',
    label: 'Qwen Image 2512 (t2i) Enabled',
    type: 'boolean',
    isSecret: false,
    validationKind: 'none',
    defaultValue: 'false',
  },
  {
    // 2026-07-24 t2i battery candidate D. Dark by default -- flip only after the morning
    // battery pick. See workers/out/t2i-battery-2026-07-24/RUNBOOK.md.
    key: 'RUNPOD_Z_IMAGE_TURBO_ENABLED',
    provider: 'runpod',
    group: 'runpod_toggles',
    label: 'Z-Image Turbo (t2i) Enabled',
    type: 'boolean',
    isSecret: false,
    validationKind: 'none',
    defaultValue: 'false',
  },
  {
    key: 'DEFAULT_PROMPT_IMAGE_AI_SERVICE',
    provider: 'runpod',
    group: 'media_defaults',
    label: 'Default prompt-image model (app)',
    type: 'string',
    isSecret: false,
    validationKind: 'none',
    defaultValue: 'z_image_turbo',
  },
  {
    key: 'DEFAULT_PROMPT_IMAGE_STYLE_ID',
    provider: 'runpod',
    group: 'media_defaults',
    label: 'Default style id (pre-selected in the app)',
    description:
      'styles.id to pre-select on the create screen. The style is also served first in the styles list, which is what shipped app builds use to pick their initial style.',
    type: 'number',
    isSecret: false,
    validationKind: 'none',
  },
  {
    key: 'DEFAULT_PROMPT_IMAGE_CONTEST_AI_SERVICE',
    provider: 'runpod',
    group: 'media_defaults',
    label: 'Default prompt-image model (legacy contests fallback)',
    type: 'string',
    isSecret: false,
    validationKind: 'none',
    defaultValue: 'krea2_turbo',
  },
  {
    key: 'RUNPOD_KREA2_TURBO_ENABLED',
    provider: 'runpod',
    group: 'runpod_toggles',
    label: 'Krea 2 Turbo Enabled',
    type: 'boolean',
    isSecret: false,
    validationKind: 'none',
    defaultValue: 'true',
  },
  {
    key: 'RUNPOD_KREA2_LORA_GENERATION_ENABLED',
    provider: 'runpod',
    group: 'runpod_toggles',
    label: 'Krea 2 LoRA Generation Enabled',
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
    key: 'RUNPOD_LTX_MEME_ENABLED',
    provider: 'runpod',
    group: 'runpod_toggles',
    label: 'LTX Meme Enabled',
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
  {
    key: 'CONTENT_BOT_ENABLED',
    provider: 'app',
    group: 'content_bot',
    label: 'Content bot enabled',
    description:
      'Master kill-switch for the automated content bot. Off by default; crons no-op while off. The preview endpoint works regardless.',
    type: 'boolean',
    isSecret: false,
    validationKind: 'none',
    defaultValue: 'false',
  },
  {
    key: 'CONTENT_BOT_USER_ID',
    provider: 'app',
    group: 'content_bot',
    label: 'Content bot user id',
    description:
      'User id the bot posts as. Set automatically on first ensure-user; also read by metrics/reward quarantine filters.',
    type: 'number',
    isSecret: false,
    validationKind: 'none',
  },
  {
    key: 'CONTENT_BOT_DAILY_POSTS',
    provider: 'app',
    group: 'content_bot',
    label: 'Content bot daily posts',
    description: 'Target number of posts the bot publishes per day.',
    type: 'number',
    isSecret: false,
    validationKind: 'none',
    defaultValue: '10',
  },
  {
    key: 'CONTENT_BOT_VIDEO_SHARE',
    provider: 'app',
    group: 'content_bot',
    label: 'Content bot video share (0..1)',
    description:
      'Fraction of daily items that are video (rest are images). Clamped to [0,1].',
    type: 'number',
    isSecret: false,
    validationKind: 'none',
    defaultValue: '0.6',
  },
  {
    key: 'CONTENT_BOT_TG_CHAT_ID',
    provider: 'app',
    group: 'content_bot',
    label: 'Content bot Telegram chat id',
    description:
      'Chat id for the daily digest. String because channel/supergroup ids are negative.',
    type: 'string',
    isSecret: false,
    validationKind: 'none',
  },
  {
    key: 'CONTENT_BOT_MAX_DAILY_ITEMS',
    provider: 'app',
    group: 'content_bot',
    label: 'Content bot max daily items (hard cap)',
    description:
      'Hard safety cap on generations per day, independent of daily-posts target.',
    type: 'number',
    isSecret: false,
    validationKind: 'none',
    defaultValue: '50',
  },
  {
    key: 'CONTENT_BOT_OPENAI_MODEL',
    provider: 'app',
    group: 'content_bot',
    label: 'Content bot prompt-writer model',
    description:
      'OpenAI model used to write the daily prompts. Falls back to the static prompt bank if unset or on error.',
    type: 'string',
    isSecret: false,
    validationKind: 'none',
    defaultValue: 'gpt-4o-mini',
  },
  {
    key: 'CONTENT_BOT_LIKES_ENABLED',
    provider: 'app',
    group: 'content_bot',
    label: 'Content bot likes enabled',
    description:
      "Lets the bot like other users' recent posts (real like path: points, activity, push). Off by default; also requires CONTENT_BOT_ENABLED.",
    type: 'boolean',
    isSecret: false,
    validationKind: 'none',
    defaultValue: 'false',
  },
  {
    key: 'CONTENT_BOT_LIKES_PER_TICK',
    provider: 'app',
    group: 'content_bot',
    label: 'Content bot likes per tick',
    description:
      'Likes per 10-minute tick. There is no daily cap by design, so this is the pacing lever for pushes and like writes. Clamped to 200.',
    type: 'number',
    isSecret: false,
    validationKind: 'none',
    defaultValue: '50',
  },
  {
    key: 'CONTENT_BOT_LIKE_MAX_POST_AGE_HOURS',
    provider: 'app',
    group: 'content_bot',
    label: 'Content bot like max post age (hours)',
    description:
      'Only posts newer than this are likeable. Also bounded by CONTENT_BOT_LIKES_START_AT, so raising it can never backfill pre-feature posts.',
    type: 'number',
    isSecret: false,
    validationKind: 'none',
    defaultValue: '48',
  },
  {
    key: 'CONTENT_BOT_LIKES_START_AT',
    provider: 'app',
    group: 'content_bot',
    label: 'Content bot likes start timestamp',
    description:
      'ISO timestamp stamped automatically on the first like tick; posts created before it are never liked. Clear it only to intentionally re-baseline.',
    type: 'string',
    isSecret: false,
    validationKind: 'none',
  },
  {
    key: 'TELEGRAM_OPS_BOT_TOKEN',
    provider: 'app',
    group: 'ops',
    label: 'Telegram ops bot token',
    description:
      'Bot token for the dedicated internal ops bot (separate from the user-facing login/referral bot). Get it from @BotFather.',
    type: 'secret',
    isSecret: true,
    validationKind: 'none',
  },
  {
    key: 'TELEGRAM_OPS_CHAT_ID',
    provider: 'app',
    group: 'ops',
    label: 'Telegram ops chat id',
    description:
      'Single chat that receives everything: backend errors, RunPod failures, generation/purchase stats, and the content-bot digest. String because group/channel ids are negative.',
    type: 'string',
    isSecret: false,
    validationKind: 'none',
  },
  {
    key: 'TELEGRAM_OPS_AUTHORIZED_CHAT_IDS',
    provider: 'app',
    group: 'ops',
    label: 'Telegram ops authorized chat ids',
    description:
      'Comma-separated chat ids allowed to use /start and the inline-button stats. Falls back to TELEGRAM_OPS_CHAT_ID if unset. Deliberately separate from TELEGRAM_OPS_CHAT_ID (that one is where outbound alerts go) — someone can look up stats without being paged on every prod error.',
    type: 'string',
    isSecret: false,
    validationKind: 'none',
  },
  {
    key: 'TELEGRAM_OPS_WEBHOOK_SECRET',
    provider: 'app',
    group: 'ops',
    label: 'Telegram ops webhook secret',
    description:
      'Shared secret passed to Telegram setWebhook; Telegram echoes it back on every call so the webhook endpoint can reject spoofed requests. Any random string.',
    type: 'secret',
    isSecret: true,
    validationKind: 'none',
  },
  {
    key: 'ADAPTY_WEBHOOK_AUTH_TOKEN',
    provider: 'adapty',
    group: 'payments',
    label: 'Adapty webhook Authorization token (production)',
    description:
      'Must match EXACTLY the "Authorization header value for production endpoint" configured in the Adapty Dashboard (Integrations -> Webhooks) — Adapty has no HMAC signing, this static value sent back verbatim as the Authorization header is its only webhook auth mechanism. Unset = the webhook accepts unauthenticated requests (logged as a warning on every call); set this AND the matching Adapty Dashboard field together, not just one side.',
    type: 'secret',
    isSecret: true,
    validationKind: 'none',
  },
  {
    key: 'ADAPTY_WEBHOOK_AUTH_TOKEN_SANDBOX',
    provider: 'adapty',
    group: 'payments',
    label: 'Adapty webhook Authorization token (sandbox)',
    description:
      'Same idea as ADAPTY_WEBHOOK_AUTH_TOKEN but for the "sandbox endpoint" field in the Adapty Dashboard, if sandbox/test purchases are also delivered to this same webhook URL. Optional — a request is accepted if it matches either configured token.',
    type: 'secret',
    isSecret: true,
    validationKind: 'none',
  },
  {
    key: REFERRAL_REWARD_SETTING_KEYS.dailyCap,
    provider: 'app',
    group: 'referrals',
    label: 'Referral reward daily cap',
    description:
      'How many referrals per calendar day can still earn the REFERRAL_REWARD points for one referrer. Redemptions above the cap still credit the invited user; the referrer gets nothing for them. 0 turns referrer rewards off. Tunable here so a farm can be shut down without a deploy.',
    type: 'number',
    isSecret: false,
    validationKind: 'none',
    defaultValue: String(REFERRAL_REWARD_DEFAULTS.dailyCap),
  },
  {
    key: REFERRAL_REWARD_SETTING_KEYS.lifetimeCap,
    provider: 'app',
    group: 'referrals',
    label: 'Referral reward lifetime cap',
    description:
      'Total referrals one referrer can ever be rewarded for. Counts referrals already paid plus those waiting for the invited user to generate; capped ones do not count.',
    type: 'number',
    isSecret: false,
    validationKind: 'none',
    defaultValue: String(REFERRAL_REWARD_DEFAULTS.lifetimeCap),
  },
];

export const PROVIDER_SETTING_DEFINITION_BY_KEY = new Map(
  PROVIDER_SETTING_DEFINITIONS.map((definition) => [
    definition.key,
    definition,
  ]),
);
