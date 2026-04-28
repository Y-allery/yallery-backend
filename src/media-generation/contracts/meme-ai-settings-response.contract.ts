import { MemeCharacterOrientation } from './meme-generation-request.contract';

export interface MemeAISettingsResponse {
  defaultSettings: {
    defaultAI: string | null;
  };
  aiSettings: Array<{
    aiService: string;
    name: string;
    cost: number;
    description: string | null;
    settings: {
      characterOrientations?: MemeCharacterOrientation[];
      defaultCharacterOrientation?: MemeCharacterOrientation;
      keepOriginalSound?: boolean;
      matchSourceDuration?: boolean;
      outputFrameRate?: number;
      pricing?: {
        strategy: 'fixed' | 'per_second';
        creditsPerSecond?: number;
      };
    } | null;
  }>;
}
