export enum AIEnum {
  AURA_FLOW = 'aura_flow',
  FLUX = 'flux',
  REALISTIC_VISION = 'realistic_vision',
  FLUX_PRO_FINE_TUNE = 'flux_pro_fine_tune',
  BYTEDANCE_EDIT = 'bytedance_edit',
  X_ROUTER = 'x_router',
}

export enum VideoAIEnum {
  BYTY_DANCE = 'byty_dance',
  KLING_TEXT_TO_VIDEO = 'kling_text_to_video',
}

export enum AudioAIEnum {
  MIRELO_SFX_VIDEO_TO_VIDEO = 'mirelo_sfx_video_to_video',
}

// Describes what inputs a generation model supports (for UI/options).
export enum ModelInputEnum {
  TEXT_PROMPT = 'TEXT_PROMPT',
  IMAGE_SOURCE = 'IMAGE_SOURCE',
  VIDEO_SOURCE = 'VIDEO_SOURCE',
  SOUND_PROMPT = 'SOUND_PROMPT',
}
