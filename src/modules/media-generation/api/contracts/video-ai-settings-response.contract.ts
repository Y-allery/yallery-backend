export interface VideoAISettingsResponse {
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
    settings: {
      durations?: number[];
      pricing?: {
        strategy: 'fixed' | 'per_second';
        creditsPerSecond?: number;
        durationCosts?: Array<{
          duration: number;
          cost: number;
        }>;
      };
    } | null;
  }>;
}
