import { MediaOrientation } from 'src/modules/media-generation/domain/presets';

export interface PromptImageDefaultSettings {
  defaultAI: string | null;
  defaultOrientations: MediaOrientation;
  /** styles.id to pre-select; styles[] is also ordered with it first. */
  defaultStyleId: number | null;
}

export interface PromptImageAISettingItem {
  aiService: string;
  name: string;
  allowedOrientations: MediaOrientation[];
  minImages: number;
  maxImages: number;
  maxPromptLength: number | null;
  cost: number;
  description: string | null;
}

export interface PromptImageAISettingsResponse {
  defaultSettings: PromptImageDefaultSettings;
  aiSettings: PromptImageAISettingItem[];
  colors: Array<{
    id: number;
    name: string;
  }>;
  styles: Array<{
    id: number;
    name: string;
    imageUrl: string | null;
  }>;
}
