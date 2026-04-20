import { AIEnum, VideoAIEnum } from 'src/common/enums/ai.enum';

export const TOKEN_POOL_KEYS = {
  FAL_SHARED: 'fal_shared',
  FAL_FINE_TUNE_CONTESTS: 'fal_fine_tune_contests',
} as const;

export const FAL_SHARED_TOKEN_SERVICES = new Set<string>([
  AIEnum.AURA_FLOW,
  AIEnum.FLUX,
  AIEnum.REALISTIC_VISION,
  AIEnum.FLUX_PRO_FINE_TUNE,
  AIEnum.BYTEDANCE_EDIT,
  VideoAIEnum.BYTY_DANCE,
  VideoAIEnum.KLING_TEXT_TO_VIDEO,
  'mmaudio_v2',
  'mmaudio-v2',
]);
