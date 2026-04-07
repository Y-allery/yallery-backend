export interface VideoAISettingsResponse {
  defaultSettings: {
    defaultAI: string | null;
  };
  aiSettings: Array<{
    aiService: string;
    name: string;
    cost: number;
    description: string | null;
    settings: {
      durations?: number[];
    } | null;
  }>;
}
