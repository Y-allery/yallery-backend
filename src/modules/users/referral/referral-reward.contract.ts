/**
 * Referral reward policy: caps and payout state.
 *
 * The referrer reward is the only place in the app where a user can mint
 * points by doing nothing but sharing a link, so it is capped and deferred
 * instead of paid on sight.
 */

export const REFERRAL_REWARD_SETTING_KEYS = {
  dailyCap: 'REFERRAL_REWARD_DAILY_CAP',
  lifetimeCap: 'REFERRAL_REWARD_LIFETIME_CAP',
} as const;

export const REFERRAL_REWARD_DEFAULTS = {
  dailyCap: 10,
  lifetimeCap: 50,
} as const;

/**
 * `pending` — code redeemed, referrer not paid yet because the invited user
 * has not generated anything; `paid` — referrer credited; `capped` — the
 * referrer was over a cap when the code was redeemed and is never paid for it.
 * NULL means "claimed before this policy existed" and is treated as paid.
 */
export const REFERRAL_REWARD_STATES = {
  PENDING: 'pending',
  PAID: 'paid',
  CAPPED: 'capped',
} as const;

export type ReferralRewardState =
  (typeof REFERRAL_REWARD_STATES)[keyof typeof REFERRAL_REWARD_STATES];

/** States that consume a slot of the referrer's daily/lifetime cap. */
export const REFERRAL_REWARDED_STATES: ReferralRewardState[] = [
  REFERRAL_REWARD_STATES.PENDING,
  REFERRAL_REWARD_STATES.PAID,
];

/** Providers that ignore dots in the local part, so a.b@ and ab@ are one inbox. */
const DOT_INSENSITIVE_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

/**
 * Collapses provider-side aliases (`+tag`, and gmail's dots) so two addresses
 * that deliver to the same mailbox compare equal. Used to reject referring
 * yourself from a second account on the same inbox — the id check alone only
 * catches the literal self-referral.
 */
export function normalizeEmailIdentity(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const separatorIndex = trimmed.lastIndexOf('@');
  if (separatorIndex <= 0) {
    return trimmed;
  }

  let local = trimmed.slice(0, separatorIndex);
  let domain = trimmed.slice(separatorIndex + 1);

  const tagIndex = local.indexOf('+');
  if (tagIndex > 0) {
    local = local.slice(0, tagIndex);
  }

  if (DOT_INSENSITIVE_DOMAINS.has(domain)) {
    local = local.split('.').join('');
    domain = 'gmail.com';
  }

  return `${local}@${domain}`;
}
