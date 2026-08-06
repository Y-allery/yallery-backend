import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import Stripe from 'stripe';
import { DataSource } from 'typeorm';
import { PartnerAccountEntity } from '../entities/partner-account.entity';
import {
  PartnerPaymentEntity,
  PartnerPaymentKind,
} from '../entities/partner-payment.entity';
import { StripeClient } from '../infrastructure/stripe.client';
import { PartnerBillingService } from './partner-billing.service';

/** Stripe works in cents; the balance works in dollars. Convert in exactly one place. */
const toCents = (usd: number): number => Math.round(usd * 100);
const toUsd = (cents: number): number => Math.round(cents) / 100;

const invalid = (message: string, status = HttpStatus.BAD_REQUEST) =>
  new HttpException(
    { error: { type: 'invalid_request_error', message } },
    status,
  );

export interface PartnerCheckout {
  url: string;
}

@Injectable()
export class PartnerPaymentService {
  private readonly logger = new Logger(PartnerPaymentService.name);

  constructor(
    private readonly stripe: StripeClient,
    private readonly billing: PartnerBillingService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private get accounts() {
    return this.dataSource.getRepository(PartnerAccountEntity);
  }

  private get payments() {
    return this.dataSource.getRepository(PartnerPaymentEntity);
  }

  /** Finds or creates the Stripe customer this account's card hangs off. */
  private async customerId(account: PartnerAccountEntity): Promise<string> {
    if (account.stripeCustomerId) return account.stripeCustomerId;

    const stripe = await this.stripe.client();
    const customer = await stripe.customers.create({
      email: account.email,
      name: account.company ?? undefined,
      metadata: { partnerAccountId: String(account.id) },
    });
    await this.accounts.update(
      { id: account.id },
      { stripeCustomerId: customer.id },
    );
    account.stripeCustomerId = customer.id;
    return customer.id;
  }

  /**
   * Hosted checkout for a one-off top-up.
   *
   * `setup_future_usage: off_session` is what makes the first payment also the moment the
   * card becomes reusable — so a partner who later switches auto top-up on does not have to
   * enter it again. The card itself never reaches this backend, which is the only reason
   * this feature is allowed to exist here at all.
   */
  async startTopUp(
    account: PartnerAccountEntity,
    amountUsd: number,
    returnUrl: string,
  ): Promise<PartnerCheckout> {
    const minimum = await this.stripe.minimumTopUpUsd();
    if (!Number.isFinite(amountUsd) || amountUsd < minimum) {
      throw invalid(`The smallest top-up is $${minimum}.`);
    }

    const stripe = await this.stripe.client();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: await this.customerId(account),
      client_reference_id: String(account.id),
      success_url: `${returnUrl}?topup=done`,
      cancel_url: `${returnUrl}?topup=cancelled`,
      payment_intent_data: {
        setup_future_usage: 'off_session',
        metadata: { partnerAccountId: String(account.id), flow: 'manual' },
      },
      metadata: { partnerAccountId: String(account.id), flow: 'manual' },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: toCents(amountUsd),
            product_data: {
              name: 'YEngine API credit',
              description: `$${amountUsd.toFixed(2)} added to your balance`,
            },
          },
        },
      ],
    });

    if (!session.url) throw invalid('Stripe did not return a checkout URL.');
    return { url: session.url };
  }

  /** Hosted checkout that only stores a card — no charge. */
  async startCardSetup(
    account: PartnerAccountEntity,
    returnUrl: string,
  ): Promise<PartnerCheckout> {
    const stripe = await this.stripe.client();
    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      currency: 'usd',
      customer: await this.customerId(account),
      client_reference_id: String(account.id),
      success_url: `${returnUrl}?card=saved`,
      cancel_url: `${returnUrl}?card=cancelled`,
      metadata: { partnerAccountId: String(account.id), flow: 'setup' },
    });

    if (!session.url) throw invalid('Stripe did not return a checkout URL.');
    return { url: session.url };
  }

  /**
   * Forgets the saved card and turns auto top-up off with it.
   *
   * Leaving the rule enabled with nothing to charge would mean a partner believing they are
   * covered while every top-up silently fails.
   */
  async removeCard(account: PartnerAccountEntity): Promise<void> {
    if (account.paymentMethodId) {
      const stripe = await this.stripe.client();
      await stripe.paymentMethods
        .detach(account.paymentMethodId)
        .catch((error) =>
          this.logger.warn(
            `could not detach payment method for account ${account.id}: ${error?.message}`,
          ),
        );
    }
    await this.accounts.update(
      { id: account.id },
      {
        paymentMethodId: null,
        paymentMethodBrand: null,
        paymentMethodLast4: null,
        autoRechargeEnabled: false,
        autoRechargeDisabledReason: 'Card removed',
      },
    );
  }

  async setAutoRecharge(
    account: PartnerAccountEntity,
    input: { enabled: boolean; thresholdUsd: number; amountUsd: number },
  ): Promise<void> {
    if (input.enabled) {
      // Deliberately allowed without a card: the rule is set in the same dialog as the
      // first payment, and that payment is what saves the card. Nothing can be charged in
      // the meantime — the claim in PartnerRechargeService will not select an account
      // without a payment method.
      const minimum = await this.stripe.minimumTopUpUsd();
      if (input.amountUsd < minimum) {
        throw invalid(`The smallest automatic top-up is $${minimum}.`);
      }
      // A threshold at or above the top-up amount never settles: the balance lands back
      // under the trigger the moment it is credited, and the card is charged again.
      if (input.thresholdUsd >= input.amountUsd) {
        throw invalid(
          'The trigger must be below the top-up amount, otherwise every top-up immediately triggers the next one.',
        );
      }
      if (input.thresholdUsd < 0)
        throw invalid('The trigger cannot be negative.');
    }

    await this.accounts.update(
      { id: account.id },
      {
        autoRechargeEnabled: input.enabled,
        autoRechargeThresholdUsd: input.thresholdUsd.toFixed(4),
        autoRechargeAmountUsd: input.amountUsd.toFixed(4),
        // Re-enabling by hand is the partner saying the card problem is fixed.
        ...(input.enabled && {
          autoRechargeFailures: 0,
          autoRechargeDisabledReason: null,
        }),
      },
    );
  }

  async history(accountId: number): Promise<PartnerPaymentEntity[]> {
    return this.payments.find({
      where: { accountId },
      order: { id: 'DESC' },
      take: 25,
    });
  }

  /**
   * Applies a Stripe event.
   *
   * Everything that moves money runs through `credit`, whose insert is the idempotency
   * gate. Nothing is credited from the browser coming back to the success URL — that is a
   * page anyone can open, not evidence that a card was charged.
   */
  async handleEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'setup') {
          await this.rememberCardFromSetup(session);
          return;
        }
        if (session.payment_status !== 'paid') return;
        await this.credit({
          accountId: Number(session.client_reference_id),
          eventId: event.id,
          paymentIntentId: this.idOf(session.payment_intent),
          checkoutSessionId: session.id,
          amountUsd: toUsd(session.amount_total ?? 0),
          kind: 'manual',
        });
        await this.rememberCardFromIntent(this.idOf(session.payment_intent));
        return;
      }

      // Only auto top-ups are credited here. A manual checkout raises this event too, and
      // crediting both would double it — the unique payment-intent index stops that anyway,
      // but relying on a constraint to catch a mistake we can simply not make is worse.
      case 'payment_intent.succeeded': {
        const intent = event.data.object as Stripe.PaymentIntent;
        if (intent.metadata?.flow !== 'auto') return;
        await this.credit({
          accountId: Number(intent.metadata.partnerAccountId),
          eventId: event.id,
          paymentIntentId: intent.id,
          checkoutSessionId: null,
          amountUsd: toUsd(intent.amount_received || intent.amount),
          kind: 'auto',
        });
        return;
      }

      case 'payment_intent.payment_failed': {
        const intent = event.data.object as Stripe.PaymentIntent;
        const accountId = Number(intent.metadata?.partnerAccountId);
        if (!accountId) return;
        await this.recordFailure(
          accountId,
          intent.id,
          toUsd(intent.amount),
          intent.last_payment_error?.code ?? 'payment_failed',
          intent.metadata?.flow === 'auto' ? 'auto' : 'manual',
        );
        return;
      }

      case 'setup_intent.succeeded': {
        const intent = event.data.object as Stripe.SetupIntent;
        await this.rememberCard(
          Number(intent.metadata?.partnerAccountId),
          this.idOf(intent.payment_method),
        );
        return;
      }

      default:
        return;
    }
  }

  private idOf(
    value: string | { id: string } | null | undefined,
  ): string | null {
    if (!value) return null;
    return typeof value === 'string' ? value : value.id;
  }

  /**
   * Records the payment and moves the balance in one transaction.
   *
   * The unique index on the event id is what makes a redelivered webhook harmless: the
   * insert throws, the transaction rolls back, and the balance is untouched. Crediting
   * first and recording after would turn Stripe's at-least-once delivery into free money.
   */
  private async credit(input: {
    accountId: number;
    eventId: string;
    paymentIntentId: string | null;
    checkoutSessionId: string | null;
    amountUsd: number;
    kind: PartnerPaymentKind;
  }): Promise<void> {
    if (!input.accountId || !(input.amountUsd > 0)) {
      this.logger.error(
        `refusing to credit from event ${input.eventId}: account ${input.accountId}, amount ${input.amountUsd}`,
      );
      return;
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(PartnerPaymentEntity).insert({
          accountId: input.accountId,
          stripeEventId: input.eventId,
          paymentIntentId: input.paymentIntentId,
          checkoutSessionId: input.checkoutSessionId,
          amountUsd: input.amountUsd.toFixed(4),
          status: 'succeeded',
          kind: input.kind,
        });

        await this.billing.topUpWithin(
          manager,
          input.accountId,
          input.amountUsd,
          input.kind === 'auto' ? 'Automatic card top-up' : 'Card top-up',
          null,
        );

        await manager.getRepository(PartnerAccountEntity).update(
          { id: input.accountId },
          {
            rechargeInFlight: false,
            autoRechargeFailures: 0,
            lastRechargeAt: new Date(),
          },
        );
      });
    } catch (error) {
      if (this.isDuplicate(error)) {
        this.logger.log(`event ${input.eventId} already applied, ignoring`);
        return;
      }
      throw error;
    }
  }

  private isDuplicate(error: unknown): boolean {
    const code = (error as { code?: string; driverError?: { code?: string } })
      ?.code;
    const driver = (error as { driverError?: { code?: string } })?.driverError
      ?.code;
    return code === 'ER_DUP_ENTRY' || driver === 'ER_DUP_ENTRY';
  }

  private async recordFailure(
    accountId: number,
    paymentIntentId: string,
    amountUsd: number,
    failureCode: string,
    kind: PartnerPaymentKind,
  ): Promise<void> {
    await this.payments
      .insert({
        accountId,
        stripeEventId: null,
        paymentIntentId,
        amountUsd: amountUsd.toFixed(4),
        status: 'failed',
        kind,
        failureCode: failureCode.slice(0, 120),
      })
      .catch(() => undefined);
  }

  private async rememberCardFromSetup(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const setupIntentId = this.idOf(session.setup_intent);
    if (!setupIntentId) return;
    const stripe = await this.stripe.client();
    const intent = await stripe.setupIntents.retrieve(setupIntentId);
    await this.rememberCard(
      Number(session.client_reference_id),
      this.idOf(intent.payment_method),
    );
  }

  private async rememberCardFromIntent(
    paymentIntentId: string | null,
  ): Promise<void> {
    if (!paymentIntentId) return;
    const stripe = await this.stripe.client();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    await this.rememberCard(
      Number(intent.metadata?.partnerAccountId),
      this.idOf(intent.payment_method),
    );
  }

  private async rememberCard(
    accountId: number,
    paymentMethodId: string | null,
  ): Promise<void> {
    if (!accountId || !paymentMethodId) return;
    const stripe = await this.stripe.client();
    const method = await stripe.paymentMethods.retrieve(paymentMethodId);
    await this.accounts.update(
      { id: accountId },
      {
        paymentMethodId,
        paymentMethodBrand: method.card?.brand ?? null,
        paymentMethodLast4: method.card?.last4 ?? null,
      },
    );
  }

  /**
   * Charges the saved card without the partner present.
   *
   * Called only by the recharge worker, which has already claimed the account, so this does
   * not concern itself with whether a top-up is due. Everything that goes wrong here is a
   * reason to stop trying rather than to retry: a card that declines will decline again, and
   * `authentication_required` means the bank wants the customer in front of the browser —
   * neither gets better on the second attempt.
   */
  async chargeSavedCard(
    account: PartnerAccountEntity,
    amountUsd: number,
  ): Promise<{ ok: boolean; reason?: string }> {
    if (!account.stripeCustomerId || !account.paymentMethodId) {
      return { ok: false, reason: 'no card on file' };
    }

    const stripe = await this.stripe.client();
    try {
      const intent = await stripe.paymentIntents.create({
        amount: toCents(amountUsd),
        currency: 'usd',
        customer: account.stripeCustomerId,
        payment_method: account.paymentMethodId,
        off_session: true,
        confirm: true,
        description: 'YEngine API automatic top-up',
        metadata: {
          partnerAccountId: String(account.id),
          flow: 'auto',
        },
      });
      // The balance is credited by the webhook, not here: one path for money in, whether it
      // came from a browser or from this worker.
      return intent.status === 'succeeded' || intent.status === 'processing'
        ? { ok: true }
        : { ok: false, reason: intent.status };
    } catch (error) {
      const code =
        (error as Stripe.errors.StripeError)?.code ??
        (error as Error)?.message ??
        'charge failed';
      return { ok: false, reason: String(code).slice(0, 120) };
    }
  }
}
