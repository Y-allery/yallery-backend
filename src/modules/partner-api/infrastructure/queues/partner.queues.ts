export const PARTNER_GENERATION_QUEUE = 'partner-generation';
export const PARTNER_WEBHOOK_QUEUE = 'partner-webhook';

export interface PartnerGenerationJobData {
  jobId: number;
}

export interface PartnerWebhookJobData {
  jobId: number;
}

/**
 * A generation is never retried by the queue.
 *
 * The partner is charged once and the hold is settled once, so a second attempt would pay
 * RunPod twice for a call we can only bill for once — and for a five-minute video job that
 * is the expensive kind of mistake. A failure goes straight to the partner, who decides.
 */
export const PARTNER_GENERATION_JOB_OPTIONS = {
  attempts: 1,
  removeOnComplete: 200,
  removeOnFail: 500,
} as const;

/** Roughly 5s, 10s, 20s, 40s, 80s, 160s — five minutes of trying before we give up. */
export const PARTNER_WEBHOOK_JOB_OPTIONS = {
  attempts: 6,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: 500,
  removeOnFail: 1000,
} as const;
