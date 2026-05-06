export interface AudioAISettingsResponse {
  defaultSettings: {
    defaultAI: string | null;
  };
  aiSettings: Array<{
    aiService: string;
    name: string;
    cost: number;
    description: string | null;
  }>;
}
