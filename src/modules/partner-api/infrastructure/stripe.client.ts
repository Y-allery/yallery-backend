import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';

export const STRIPE_SECRET_KEY = 'STRIPE_SECRET_KEY';
export const STRIPE_WEBHOOK_SECRET = 'STRIPE_WEBHOOK_SECRET';
export const STRIPE_MIN_TOPUP_USD = 'STRIPE_MIN_TOPUP_USD';

export const DEFAULT_MIN_TOPUP_USD = 10;

/**
 * Builds the Stripe SDK from the runtime settings rather than from the environment.
 *
 * Every other credential in this backend lives in `provider_runtime_settings` and is
 * editable in the admin, so keys can be rotated without a deploy. Reading `process.env`
 * here would be the one exception nobody remembers on the day the key has to change.
 *
 * The client is rebuilt when the key changes, and absent configuration is a plain
 * "unavailable" rather than a crash: the product still works without cards, it just means
 * an admin top-up is the only way money comes in.
 */
@Injectable()
export class StripeClient {
  private cached: { key: string; stripe: Stripe } | null = null;

  constructor(private readonly config: ProviderRuntimeConfigService) {}

  async isConfigured(): Promise<boolean> {
    return Boolean(await this.config.getString(STRIPE_SECRET_KEY));
  }

  async minimumTopUpUsd(): Promise<number> {
    const configured = await this.config.getNumber(
      STRIPE_MIN_TOPUP_USD,
      DEFAULT_MIN_TOPUP_USD,
    );
    return Math.max(1, configured ?? DEFAULT_MIN_TOPUP_USD);
  }

  async client(): Promise<Stripe> {
    const key = await this.config.getString(STRIPE_SECRET_KEY);
    if (!key) {
      throw new HttpException(
        {
          error: {
            type: 'invalid_request_error',
            message:
              'Card payment is not available yet. Contact support to have your balance topped up.',
          },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (this.cached?.key !== key) {
      this.cached = { key, stripe: new Stripe(key) };
    }
    return this.cached.stripe;
  }

  /**
   * Verifies a webhook against the signing secret and returns the event.
   *
   * The raw body is required — `JSON.parse` followed by `JSON.stringify` reorders keys and
   * the signature no longer matches, which is the classic way this check gets quietly
   * disabled. A missing secret rejects rather than trusts: an unverified webhook is a
   * stranger asking us to add money to an account.
   */
  async constructEvent(
    payload: Buffer,
    signature: string,
  ): Promise<Stripe.Event> {
    const secret = await this.config.getString(STRIPE_WEBHOOK_SECRET);
    if (!secret) {
      throw new HttpException(
        {
          error: {
            type: 'invalid_request_error',
            message: 'Webhooks are not configured.',
          },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const stripe = await this.client();
    try {
      return stripe.webhooks.constructEvent(payload, signature, secret);
    } catch {
      throw new HttpException(
        {
          error: {
            type: 'authentication_error',
            message: 'Signature verification failed.',
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
