export interface EditImageDefaultSettings {
  defaultAI: string | null;
}

export interface EditImageAISettingItem {
  aiService: string;
  name: string;
  /** OUTPUT images per edit. Stays 1/1 — do not repurpose for the reference count. */
  minImages: number;
  maxImages: number;
  /** INPUT reference images the model accepts (1..3). Drives the app's multi-slot picker. */
  minReferenceImages: number;
  maxReferenceImages: number;
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
