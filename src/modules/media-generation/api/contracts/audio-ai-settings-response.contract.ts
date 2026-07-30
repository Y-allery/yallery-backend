export interface AudioAISettingsResponse {
  defaultSettings: {
    defaultAI: string | null;
  };
  aiSettings: Array<{
    aiService: string;
    name: string;
    cost: number;
    description: string | null;
    /** Prompt-length budget in characters, read by the app at the top level. */
    maxPromptLength: number;
  }>;
}
