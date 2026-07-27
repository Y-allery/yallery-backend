/**
 * Shape of GET /economy. Every number is read live from the same sources the
 * backend charges against (the rewards table, provider runtime settings and
 * media_ai_settings), so the client can never show a price the server does not
 * actually apply.
 */

export interface EconomyRuleResponse {
  /** Points moved by one event. Always a positive number; `direction` says which way. */
  points: number;
  direction: 'earn' | 'spend';
  /** Backend reward type, useful for claim calls and analytics. */
  rewardType: string | null;
  /** Claimable once per calendar day. */
  daily: boolean;
  /** Currently switched on. Disabled rules are returned so the UI can hide them explicitly. */
  active: boolean;
  description: string | null;
}

export interface EconomyReferralResponse extends EconomyRuleResponse {
  /** Both the inviter and the invited account receive `points`. */
  bothSides: boolean;
  dailyCap: number;
  lifetimeCap: number;
  /** The inviter is paid only after the invited account completes a generation. */
  requiresReferredGeneration: boolean;
}

export interface EconomyGenerationPriceResponse {
  aiService: string;
  name: string;
  /** Fixed cost, or the base cost when `creditsPerSecond` is present. */
  points: number;
  strategy: 'fixed' | 'per_second';
  creditsPerSecond: number | null;
  /** Resolved cost per supported duration, e.g. `{ "5": 175, "10": 350 }`. */
  durationCosts: Record<string, number> | null;
}

export interface EconomyResponse {
  currency: {
    code: string;
    /** User-facing name of the balance shown in the app. */
    name: string;
  };
  /** Ways a user gains points, keyed by a stable client-facing name. */
  earn: {
    likeReceived: EconomyRuleResponse;
    dailyLogin: EconomyRuleResponse;
    postPhoto: EconomyRuleResponse;
    postVideo: EconomyRuleResponse;
    contestParticipation: EconomyRuleResponse;
    rateApp: EconomyRuleResponse;
    sharePost: EconomyRuleResponse;
    registrationBonus: EconomyRuleResponse;
    referral: EconomyReferralResponse;
  };
  /** Ways a user loses points, excluding generation (see `generation`). */
  spend: {
    likeGiven: EconomyRuleResponse;
  };
  /**
   * Generation prices per capability. This mirrors the per-capability
   * `/media-generation/*​/ai-settings` endpoints, which stay authoritative for
   * model pickers; this block exists so a wallet screen needs one call.
   */
  generation: {
    image: EconomyGenerationPriceResponse[];
    imageEdit: EconomyGenerationPriceResponse[];
    video: EconomyGenerationPriceResponse[];
    meme: EconomyGenerationPriceResponse[];
    audio: EconomyGenerationPriceResponse[];
  };
}
