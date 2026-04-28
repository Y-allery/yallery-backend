import { AIEnum } from '../enums/ai.enum';

type Dimension = {
  width: number;
  height: number;
};

const SUPPORTED_RESOLUTIONS: Record<AIEnum, Record<string, Dimension>> = {
  [AIEnum.FLUX]: {
    vertical: { width: 768, height: 1344 },
    horizontal: { width: 1344, height: 768 },
  },
  [AIEnum.AURA_FLOW]: {
    vertical: { width: 768, height: 1344 },
    horizontal: { width: 1344, height: 768 },
  },
  [AIEnum.REALISTIC_VISION]: {
    vertical: { width: 576, height: 1024 },
    horizontal: { width: 1344, height: 768 },
  },
  [AIEnum.BYTEDANCE_EDIT]: {
    vertical: { width: 768, height: 1344 },
    horizontal: { width: 1344, height: 768 },
  },
  [AIEnum.X_ROUTER]: {
    vertical: { width: 768, height: 1344 },
    horizontal: { width: 1344, height: 768 },
  },
};

export function getDimensionsForOrientation(
  orientation: 'horizontal' | 'vertical',
  aiService: AIEnum,
): Dimension {
  return SUPPORTED_RESOLUTIONS[aiService][orientation];
}
