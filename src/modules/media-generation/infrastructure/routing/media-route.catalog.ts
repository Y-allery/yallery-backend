import {
  MEDIA_AUDIO_GENERATION_QUEUE,
  MEDIA_IMAGE_EDIT_GENERATION_QUEUE,
  MEDIA_IMAGE_VIDEO_GENERATION_QUEUE,
  MEDIA_MEME_GENERATION_QUEUE,
  MEDIA_PROMPT_IMAGE_GENERATION_QUEUE,
  MEDIA_TEXT_VIDEO_GENERATION_QUEUE,
} from 'src/modules/media-generation/infrastructure/queues/constants/media-generation.queue';
import { MediaCapability } from 'src/modules/media-generation/domain/enums/media-capability.enum';
import { MediaDispatch } from 'src/modules/media-generation/domain/enums/media-dispatch.enum';
import { MediaProvider } from 'src/modules/media-generation/domain/enums/media-provider.enum';

export type MediaRouteType =
  | 'promptImage'
  | 'imageEdit'
  | 'audio'
  | 'textVideo'
  | 'imageVideo'
  | 'meme';

export interface MediaRouteCatalogEntry {
  routeType: MediaRouteType;
  aiService: string;
  capability: MediaCapability;
  provider: MediaProvider;
  dispatch: MediaDispatch;
  queueName: string;
  endpointConfigKey: string;
  /**
   * Config key for an alternate RunPod API key (e.g. a second account that hosts the
   * video endpoint). Falls back to RUNPOD_API_KEY when omitted.
   */
  apiKeyConfigKey?: string;
  enabledConfigKey?: string;
  statusTimeoutConfigKey?: string;
  statusTimeoutLabel?: string;
  defaultStatusTimeoutMs?: number;
}

export const RUNPOD_MEDIA_ROUTE_CATALOG: MediaRouteCatalogEntry[] = [
  {
    routeType: 'promptImage',
    aiService: 'flux2_klein',
    capability: MediaCapability.IMAGE_GENERATE,
    provider: MediaProvider.RUNPOD,
    dispatch: MediaDispatch.BULLMQ_QUEUE,
    queueName: MEDIA_PROMPT_IMAGE_GENERATION_QUEUE,
    endpointConfigKey: 'RUNPOD_FLUX2_KLEIN_ENDPOINT_ID',
    enabledConfigKey: 'RUNPOD_FLUX2_KLEIN_ENABLED',
    statusTimeoutConfigKey: 'RUNPOD_FLUX2_KLEIN_STATUS_TIMEOUT_MS',
    statusTimeoutLabel: 'Flux 2 Klein Status Timeout',
    defaultStatusTimeoutMs: 1200000,
  },
  {
    routeType: 'promptImage',
    aiService: 'qwen_image',
    capability: MediaCapability.IMAGE_GENERATE,
    provider: MediaProvider.RUNPOD,
    dispatch: MediaDispatch.BULLMQ_QUEUE,
    queueName: MEDIA_PROMPT_IMAGE_GENERATION_QUEUE,
    endpointConfigKey: 'RUNPOD_QWEN_IMAGE_ENDPOINT_ID',
    // Lives on RunPod account #2 (the LTX/video account) — same per-route key.
    apiKeyConfigKey: 'RUNPOD_VIDEO_API_KEY',
    enabledConfigKey: 'RUNPOD_QWEN_IMAGE_ENABLED',
    statusTimeoutConfigKey: 'RUNPOD_QWEN_IMAGE_STATUS_TIMEOUT_MS',
    statusTimeoutLabel: 'Qwen Image Status Timeout',
    defaultStatusTimeoutMs: 1200000,
  },
  {
    // Battery candidate C (2026-07-24 t2i upgrade night): Qwen-Image-2512, undistilled
    // 50-step/cfg4.0 checkpoint. Dark by default (RUNPOD_QWEN_IMAGE_2512_ENABLED=false) --
    // see workers/out/t2i-battery-2026-07-24/RUNBOOK.md for the morning flip.
    routeType: 'promptImage',
    aiService: 'qwen_image_2512',
    capability: MediaCapability.IMAGE_GENERATE,
    provider: MediaProvider.RUNPOD,
    dispatch: MediaDispatch.BULLMQ_QUEUE,
    queueName: MEDIA_PROMPT_IMAGE_GENERATION_QUEUE,
    endpointConfigKey: 'RUNPOD_QWEN_IMAGE_2512_ENDPOINT_ID',
    apiKeyConfigKey: 'RUNPOD_VIDEO_API_KEY',
    enabledConfigKey: 'RUNPOD_QWEN_IMAGE_2512_ENABLED',
    statusTimeoutConfigKey: 'RUNPOD_QWEN_IMAGE_2512_STATUS_TIMEOUT_MS',
    statusTimeoutLabel: 'Qwen Image 2512 Status Timeout',
    defaultStatusTimeoutMs: 1200000,
  },
  {
    // Battery candidate D (2026-07-24 t2i upgrade night): Z-Image-Turbo (Tongyi/Alibaba,
    // 6B, Apache-2.0). Production capacity lives on the second RunPod account after replacing
    // the legacy Qwen image-generate endpoint there. Qwen Image Edit remains on the main
    // account, so this route must use the same per-route video-account key as qwen_image.
    routeType: 'promptImage',
    aiService: 'z_image_turbo',
    capability: MediaCapability.IMAGE_GENERATE,
    provider: MediaProvider.RUNPOD,
    dispatch: MediaDispatch.BULLMQ_QUEUE,
    queueName: MEDIA_PROMPT_IMAGE_GENERATION_QUEUE,
    endpointConfigKey: 'RUNPOD_Z_IMAGE_TURBO_ENDPOINT_ID',
    apiKeyConfigKey: 'RUNPOD_VIDEO_API_KEY',
    enabledConfigKey: 'RUNPOD_Z_IMAGE_TURBO_ENABLED',
    statusTimeoutConfigKey: 'RUNPOD_Z_IMAGE_TURBO_STATUS_TIMEOUT_MS',
    statusTimeoutLabel: 'Z-Image Turbo Status Timeout',
    defaultStatusTimeoutMs: 1200000,
  },
  {
    routeType: 'promptImage',
    aiService: 'sdxl',
    capability: MediaCapability.IMAGE_GENERATE,
    provider: MediaProvider.RUNPOD,
    dispatch: MediaDispatch.BULLMQ_QUEUE,
    queueName: MEDIA_PROMPT_IMAGE_GENERATION_QUEUE,
    endpointConfigKey: 'RUNPOD_SDXL_ENDPOINT_ID',
    enabledConfigKey: 'RUNPOD_SDXL_ENABLED',
    statusTimeoutConfigKey: 'RUNPOD_SDXL_STATUS_TIMEOUT_MS',
    statusTimeoutLabel: 'SDXL Status Timeout',
    defaultStatusTimeoutMs: 1200000,
  },
  {
    routeType: 'promptImage',
    aiService: 'sdxl_lora_generation',
    capability: MediaCapability.IMAGE_GENERATE,
    provider: MediaProvider.RUNPOD,
    dispatch: MediaDispatch.BULLMQ_QUEUE,
    queueName: MEDIA_PROMPT_IMAGE_GENERATION_QUEUE,
    endpointConfigKey: 'RUNPOD_SDXL_LORA_GENERATION_ENDPOINT_ID',
    enabledConfigKey: 'RUNPOD_SDXL_LORA_GENERATION_ENABLED',
    statusTimeoutConfigKey: 'RUNPOD_SDXL_LORA_GENERATION_STATUS_TIMEOUT_MS',
    statusTimeoutLabel: 'SDXL LoRA Generation Status Timeout',
    defaultStatusTimeoutMs: 1800000,
  },
  {
    routeType: 'imageEdit',
    aiService: 'qwen_image_edit_baked',
    capability: MediaCapability.IMAGE_EDIT,
    provider: MediaProvider.RUNPOD,
    dispatch: MediaDispatch.BULLMQ_QUEUE,
    queueName: MEDIA_IMAGE_EDIT_GENERATION_QUEUE,
    endpointConfigKey: 'RUNPOD_QWEN_IMAGE_EDIT_BAKED_ENDPOINT_ID',
    enabledConfigKey: 'RUNPOD_QWEN_IMAGE_EDIT_BAKED_ENABLED',
    statusTimeoutConfigKey: 'RUNPOD_QWEN_IMAGE_EDIT_BAKED_STATUS_TIMEOUT_MS',
    statusTimeoutLabel: 'Qwen Image Edit Status Timeout',
    defaultStatusTimeoutMs: 1200000,
  },
  {
    routeType: 'audio',
    aiService: 'mmaudio_v2',
    capability: MediaCapability.AUDIO_GENERATE,
    provider: MediaProvider.RUNPOD,
    dispatch: MediaDispatch.BULLMQ_QUEUE,
    queueName: MEDIA_AUDIO_GENERATION_QUEUE,
    endpointConfigKey: 'RUNPOD_MMAUDIO_ENDPOINT_ID',
    enabledConfigKey: 'RUNPOD_MMAUDIO_ENABLED',
    statusTimeoutConfigKey: 'RUNPOD_MMAUDIO_STATUS_TIMEOUT_MS',
    statusTimeoutLabel: 'MMAudio Status Timeout',
    defaultStatusTimeoutMs: 7200000,
  },
  {
    routeType: 'textVideo',
    aiService: 'p_video_text',
    capability: MediaCapability.VIDEO_GENERATE,
    provider: MediaProvider.RUNPOD,
    dispatch: MediaDispatch.BULLMQ_QUEUE,
    queueName: MEDIA_TEXT_VIDEO_GENERATION_QUEUE,
    endpointConfigKey: 'RUNPOD_P_VIDEO_ENDPOINT_ID',
    apiKeyConfigKey: 'RUNPOD_VIDEO_API_KEY',
    enabledConfigKey: 'RUNPOD_P_VIDEO_ENABLED',
    statusTimeoutConfigKey: 'RUNPOD_P_VIDEO_TEXT_STATUS_TIMEOUT_MS',
    statusTimeoutLabel: 'P-Video Text Status Timeout',
    defaultStatusTimeoutMs: 7200000,
  },
  {
    routeType: 'imageVideo',
    aiService: 'p_video_image',
    capability: MediaCapability.VIDEO_GENERATE,
    provider: MediaProvider.RUNPOD,
    dispatch: MediaDispatch.BULLMQ_QUEUE,
    queueName: MEDIA_IMAGE_VIDEO_GENERATION_QUEUE,
    endpointConfigKey: 'RUNPOD_P_VIDEO_ENDPOINT_ID',
    apiKeyConfigKey: 'RUNPOD_VIDEO_API_KEY',
    enabledConfigKey: 'RUNPOD_P_VIDEO_ENABLED',
    statusTimeoutConfigKey: 'RUNPOD_P_VIDEO_IMAGE_STATUS_TIMEOUT_MS',
    statusTimeoutLabel: 'P-Video Image Status Timeout',
    defaultStatusTimeoutMs: 7200000,
  },
  {
    routeType: 'meme',
    aiService: 'wan22_animate_native',
    capability: MediaCapability.MEME_GENERATE,
    provider: MediaProvider.RUNPOD,
    dispatch: MediaDispatch.BULLMQ_QUEUE,
    queueName: MEDIA_MEME_GENERATION_QUEUE,
    endpointConfigKey: 'RUNPOD_WAN22_ANIMATE_MEME_ENDPOINT_ID',
    enabledConfigKey: 'RUNPOD_WAN22_ANIMATE_MEME_ENABLED',
    statusTimeoutConfigKey: 'RUNPOD_WAN22_ANIMATE_MEME_STATUS_TIMEOUT_MS',
    statusTimeoutLabel: 'WAN 2.2 Animate Meme Status Timeout',
    defaultStatusTimeoutMs: 7200000,
  },
  {
    // LTX meme motion control (worker v8.20+: DWPose reference + Union IC-LoRA). Lives on the
    // VIDEO RunPod account, hence the per-route api key — same mechanism as the p_video routes.
    aiService: 'ltx_meme',
    routeType: 'meme',
    capability: MediaCapability.MEME_GENERATE,
    provider: MediaProvider.RUNPOD,
    dispatch: MediaDispatch.BULLMQ_QUEUE,
    queueName: MEDIA_MEME_GENERATION_QUEUE,
    endpointConfigKey: 'RUNPOD_LTX_MEME_ENDPOINT_ID',
    apiKeyConfigKey: 'RUNPOD_VIDEO_API_KEY',
    enabledConfigKey: 'RUNPOD_LTX_MEME_ENABLED',
    statusTimeoutConfigKey: 'RUNPOD_LTX_MEME_STATUS_TIMEOUT_MS',
    statusTimeoutLabel: 'LTX Meme Status Timeout',
    defaultStatusTimeoutMs: 7200000,
  },
];

export function getRunpodMediaRoute(
  aiService: string,
  routeType: MediaRouteType,
): MediaRouteCatalogEntry | null {
  return (
    RUNPOD_MEDIA_ROUTE_CATALOG.find(
      (route) => route.aiService === aiService && route.routeType === routeType,
    ) ?? null
  );
}
