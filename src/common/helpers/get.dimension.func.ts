import { AIEnum } from '../enums/ai.enum';

type Dimension = {
  width: number;
  height: number;
};

const SUPPORTED_RESOLUTIONS: Record<AIEnum, Record<string, Dimension>> = {
  [AIEnum.FLUX]: {
    vertical: { width: 768, height: 1344 },
    horizontal: { width: 1024, height: 1024 },
  },
  [AIEnum.AURA_FLOW]: {
    vertical: { width: 768, height: 1344 },
    horizontal: { width: 1024, height: 1024 },
  },
  [AIEnum.REALISTIC_VISION]: {
    vertical: { width: 576, height: 1024 },
    horizontal: { width: 1024, height: 1024 },
  },
  [AIEnum.FLUX_PRO_FINE_TUNE]: {
    vertical: { width: 576, height: 1024 },
    horizontal: { width: 1024, height: 1024 },
  },
};

export function getDimensionsForOrientation(
  orientation: 'horizontal' | 'vertical',
  aiService: AIEnum,
): Dimension {
  return SUPPORTED_RESOLUTIONS[aiService][orientation];
}

export function getCostByService(service: AIEnum): number {
  const pricing = {
    [AIEnum.FLUX]: 10,
    [AIEnum.AURA_FLOW]: 15,
    [AIEnum.REALISTIC_VISION]: 20,
  };

  return pricing[service] || 0;
}
