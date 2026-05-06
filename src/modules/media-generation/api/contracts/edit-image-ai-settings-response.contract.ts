export interface EditImageDefaultSettings {
  defaultAI: string | null;
}

export interface EditImageAISettingItem {
  aiService: string;
  name: string;
  minImages: number;
  maxImages: number;
  maxPromptLength: number | null;
  cost: number;
  description: string | null;
}

export interface EditImageAISettingsResponse {
  defaultSettings: EditImageDefaultSettings;
  aiSettings: EditImageAISettingItem[];
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
