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
    } | null;
  }>;
}
