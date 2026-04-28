import { AIEnum } from '../enums/ai.enum';

export const RATE_LIMITS = {
  [AIEnum.FLUX]: { limit: 16, window: 60 },
  [AIEnum.AURA_FLOW]: { limit: 16, window: 60 },
  [AIEnum.REALISTIC_VISION]: { limit: 16, window: 60 },
};
