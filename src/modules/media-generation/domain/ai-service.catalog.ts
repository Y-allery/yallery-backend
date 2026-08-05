/**
 * Canonical AI service identifiers.
 *
 * These are the ids the API speaks — they are product names, not model names. The engine
 * behind each one is an implementation detail we do not publish: the key travels in every
 * ai-settings response and in every generation request, so a vendor-shaped key would leak
 * the stack to anyone reading a response.
 *
 * Renaming a protocol id cannot be a rip-and-replace: app builds already in the wild send
 * the old ids, and 22k stored posts carry them in generationParams. LEGACY_AI_SERVICE_IDS
 * maps every retired id onto its canonical one, and normalizeAiService() is applied where
 * a client-supplied id enters the system. Old clients keep working; nothing new is minted
 * under a legacy id.
 */
export const AI_SERVICES = {
  // image_generate
  PHOTO: 'yengine_photo',
  PHOTO_PRO: 'yengine_photo_pro',
  PHOTO_LITE: 'yengine_photo_lite',
  PHOTO_V1: 'yengine_photo_v1',
  PHOTO_V2: 'yengine_photo_v2',
  PHOTO_LEGACY: 'yengine_photo_legacy',
  PORTRAIT: 'yengine_portrait',
  PORTRAIT_PRO: 'yengine_portrait_pro',
  PORTRAIT_LEGACY: 'yengine_portrait_legacy',
  // image_edit
  EDIT: 'yengine_edit',
  // finetune_train
  PORTRAIT_TRAINER: 'yengine_portrait_trainer',
  PORTRAIT_TRAINER_LEGACY: 'yengine_portrait_trainer_legacy',
  // audio_generate
  AUDIO: 'yengine_audio',
  // video_generate
  VIDEO_TEXT: 'yengine_video_text',
  VIDEO_IMAGE: 'yengine_video_image',
  // meme_generate — two interchangeable backends, switched by a runtime flag
  MEME: 'yengine_meme',
  MEME_LITE: 'yengine_meme_lite',
  /**
   * History-only buckets. Nothing routes to these; they exist because ~580 stored posts
   * carry ids from engines retired before this module, and those ids are still published
   * in the feed and in the regenerate flow.
   */
  EDIT_LEGACY: 'yengine_edit_legacy',
  VIDEO_LEGACY: 'yengine_video_legacy',
  MEME_LEGACY: 'yengine_meme_legacy',
} as const;

export type AiServiceId = (typeof AI_SERVICES)[keyof typeof AI_SERVICES];

/** Retired vendor-shaped ids, still accepted from clients that have not updated. */
export const LEGACY_AI_SERVICE_IDS: Readonly<Record<string, AiServiceId>> = {
  z_image_turbo: AI_SERVICES.PHOTO,
  krea2_turbo: AI_SERVICES.PHOTO_PRO,
  flux2_klein: AI_SERVICES.PHOTO_LITE,
  qwen_image: AI_SERVICES.PHOTO_V1,
  qwen_image_2512: AI_SERVICES.PHOTO_V2,
  sdxl: AI_SERVICES.PHOTO_LEGACY,
  krea2_lora_generation: AI_SERVICES.PORTRAIT,
  flux_fine_tune: AI_SERVICES.PORTRAIT_PRO,
  sdxl_lora_generation: AI_SERVICES.PORTRAIT_LEGACY,
  qwen_image_edit_baked: AI_SERVICES.EDIT,
  krea2_lora_finetune: AI_SERVICES.PORTRAIT_TRAINER,
  sdxl_lora_finetune: AI_SERVICES.PORTRAIT_TRAINER_LEGACY,
  mmaudio_v2: AI_SERVICES.AUDIO,
  p_video_text: AI_SERVICES.VIDEO_TEXT,
  p_video_image: AI_SERVICES.VIDEO_IMAGE,
  wan22_animate_native: AI_SERVICES.MEME,
  ltx_meme: AI_SERVICES.MEME_LITE,

  // Retired before this module existed; present only in stored posts.
  flux: AI_SERVICES.PHOTO_LEGACY,
  flux_schnell: AI_SERVICES.PHOTO_LEGACY,
  aura_flow: AI_SERVICES.PHOTO_LEGACY,
  realistic_vision: AI_SERVICES.PHOTO_LEGACY,
  nano_banana: AI_SERVICES.PHOTO_LEGACY,
  x_router: AI_SERVICES.PHOTO_LEGACY,
  flux_pro_fine_tune: AI_SERVICES.PORTRAIT_PRO,
  bytedance_edit: AI_SERVICES.EDIT_LEGACY,
  grok_image_edit: AI_SERVICES.EDIT_LEGACY,
  qwen_image_edit: AI_SERVICES.EDIT_LEGACY,
  kling_text_to_video: AI_SERVICES.VIDEO_LEGACY,
  kling_v26_std_motion_control: AI_SERVICES.MEME_LEGACY,
  byty_dance: AI_SERVICES.MEME_LEGACY,
};

const CANONICAL_IDS: ReadonlySet<string> = new Set(Object.values(AI_SERVICES));

/**
 * Resolves a client-supplied id to its canonical form.
 *
 * An unknown value is returned untouched rather than rejected: the caller that looks it
 * up (route catalog, ai-settings, pricing) already fails on an unknown service with a
 * message that names it, and swallowing it here would turn that into a confusing miss.
 */
export function normalizeAiService<T extends string | null | undefined>(
  aiService: T,
): T {
  if (typeof aiService !== 'string') return aiService;
  const trimmed = aiService.trim();
  if (CANONICAL_IDS.has(trimmed)) return trimmed as T;
  return (LEGACY_AI_SERVICE_IDS[trimmed] ?? trimmed) as T;
}

/** True when the id is one we still publish. */
export function isCanonicalAiService(aiService: string): boolean {
  return CANONICAL_IDS.has(aiService);
}
