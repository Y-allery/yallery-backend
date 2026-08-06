import Stripe from 'stripe';
import { PartnerPaymentService } from './partner-payment.service';

describe('PartnerPaymentService', () => {
  let stripeApi: {
    checkout: { sessions: { create: jest.Mock } };
    customers: { create: jest.Mock };
    paymentIntents: { create: jest.Mock; retrieve: jest.Mock };
    setupIntents: { retrieve: jest.Mock };
    paymentMethods: { retrieve: jest.Mock; detach: jest.Mock };
  };
  let stripe: {
    client: jest.Mock;
    minimumTopUpUsd: jest.Mock;
    isConfigured: jest.Mock;
  };
  let billing: { topUpWithin: jest.Mock };
  let inserted: Array<Record<string, unknown>>;
  let updated: Array<Record<string, unknown>>;
  let insertThrows: Error | null;
  let dataSource: Record<string, unknown>;
  let service: PartnerPaymentService;

  const ACCOUNT: Record<string, unknown> = {
    id: 5,
    email: 'ops@paysun.io',
    company: 'Paysun',
    stripeCustomerId: 'cus_1',
    paymentMethodId: 'pm_1',
  };
  const account = (overrides: Record<string, unknown> = {}) =>
    ({ ...ACCOUNT, ...overrides }) as never;

  const repository = () => ({
    insert: jest.fn(async (row: Record<string, unknown>) => {
      if (insertThrows) throw insertThrows;
      inserted.push(row);
      return { identifiers: [{ id: 1 }] };
    }),
    update: jest.fn(
      async (criteria: unknown, value: Record<string, unknown>) => {
        updated.push({ criteria, ...value });
        return { affected: 1 };
      },
    ),
    find: jest.fn(async () => []),
  });

  beforeEach(() => {
    inserted = [];
    updated = [];
    insertThrows = null;
    stripeApi = {
      checkout: {
        sessions: {
          create: jest
            .fn()
            .mockResolvedValue({ id: 'cs_1', url: 'https://stripe/pay' }),
        },
      },
      customers: { create: jest.fn().mockResolvedValue({ id: 'cus_new' }) },
      paymentIntents: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'pi_1', status: 'succeeded' }),
        retrieve: jest.fn().mockResolvedValue({
          id: 'pi_1',
          payment_method: 'pm_1',
          metadata: { partnerAccountId: '5' },
        }),
      },
      setupIntents: {
        retrieve: jest.fn().mockResolvedValue({ payment_method: 'pm_1' }),
      },
      paymentMethods: {
        retrieve: jest
          .fn()
          .mockResolvedValue({ card: { brand: 'visa', last4: '4242' } }),
        detach: jest.fn().mockResolvedValue({}),
      },
    };
    stripe = {
      client: jest.fn().mockResolvedValue(stripeApi),
      minimumTopUpUsd: jest.fn().mockResolvedValue(10),
      isConfigured: jest.fn().mockResolvedValue(true),
    };
    billing = { topUpWithin: jest.fn().mockResolvedValue(35) };
    dataSource = {
      getRepository: jest.fn(repository),
      transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) =>
        fn({ getRepository: repository }),
      ),
    };
    service = new PartnerPaymentService(
      stripe as never,
      billing as never,
      dataSource as never,
    );
  });

  const event = (type: string, object: unknown, id = 'evt_1') =>
    ({ id, type, data: { object } }) as Stripe.Event;

  describe('top-up checkout', () => {
    it('refuses an amount under the minimum', async () => {
      await expect(
        service.startTopUp(account(), 5, 'https://x/portal'),
      ).rejects.toMatchObject({ status: 400 });
      expect(stripeApi.checkout.sessions.create).not.toHaveBeenCalled();
    });

    // Paying once should be enough to enable automatic top-ups later.
    it('saves the card for later while taking the first payment', async () => {
      await service.startTopUp(account(), 25, 'https://x/portal');

      const args = stripeApi.checkout.sessions.create.mock.calls[0][0];
      expect(args.mode).toBe('payment');
      expect(args.payment_intent_data.setup_future_usage).toBe('off_session');
      expect(args.line_items[0].price_data.unit_amount).toBe(2500);
      expect(args.client_reference_id).toBe('5');
    });
  });

  describe('webhooks', () => {
    const paidSession = {
      mode: 'payment',
      payment_status: 'paid',
      id: 'cs_1',
      client_reference_id: '5',
      payment_intent: 'pi_1',
      amount_total: 2500,
    };

    it('credits the balance from a completed checkout', async () => {
      await service.handleEvent(
        event('checkout.session.completed', paidSession),
      );

      expect(billing.topUpWithin).toHaveBeenCalledWith(
        expect.anything(),
        5,
        25,
        'Card top-up',
        null,
      );
      expect(inserted[0]).toMatchObject({
        stripeEventId: 'evt_1',
        paymentIntentId: 'pi_1',
        status: 'succeeded',
        kind: 'manual',
      });
    });

    // Stripe redelivers until it gets a 2xx. The unique index is the only thing standing
    // between that and a balance that grows on its own.
    it('ignores a redelivered event instead of crediting twice', async () => {
      insertThrows = Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });

      await expect(
        service.handleEvent(event('checkout.session.completed', paidSession)),
      ).resolves.toBeUndefined();
      expect(billing.topUpWithin).not.toHaveBeenCalled();
    });

    it('does not credit a session that was not paid', async () => {
      await service.handleEvent(
        event('checkout.session.completed', {
          ...paidSession,
          payment_status: 'unpaid',
        }),
      );

      expect(billing.topUpWithin).not.toHaveBeenCalled();
    });

    // A manual checkout raises payment_intent.succeeded as well; crediting both would
    // double every top-up a partner makes by hand.
    it('ignores payment_intent.succeeded unless it is an automatic top-up', async () => {
      await service.handleEvent(
        event('payment_intent.succeeded', {
          id: 'pi_2',
          amount: 1000,
          amount_received: 1000,
          metadata: { partnerAccountId: '5', flow: 'manual' },
        }),
      );

      expect(billing.topUpWithin).not.toHaveBeenCalled();
    });

    it('credits an automatic top-up from the payment intent', async () => {
      await service.handleEvent(
        event('payment_intent.succeeded', {
          id: 'pi_3',
          amount: 1000,
          amount_received: 1000,
          metadata: { partnerAccountId: '5', flow: 'auto' },
        }),
      );

      expect(billing.topUpWithin).toHaveBeenCalledWith(
        expect.anything(),
        5,
        10,
        'Automatic card top-up',
        null,
      );
    });

    it('refuses to credit an event with no account on it', async () => {
      await service.handleEvent(
        event('checkout.session.completed', {
          ...paidSession,
          client_reference_id: null,
        }),
      );

      expect(billing.topUpWithin).not.toHaveBeenCalled();
    });

    it('stores the card from a setup session', async () => {
      await service.handleEvent(
        event('checkout.session.completed', {
          mode: 'setup',
          client_reference_id: '5',
          setup_intent: 'seti_1',
        }),
      );

      expect(updated).toContainEqual(
        expect.objectContaining({
          paymentMethodId: 'pm_1',
          paymentMethodBrand: 'visa',
          paymentMethodLast4: '4242',
        }),
      );
    });
  });

  describe('auto top-up rule', () => {
    // The rule is set in the same dialog as the first payment, and that payment is what
    // saves the card — so refusing here would make the dialog impossible to submit.
    it('can be armed before a card exists', async () => {
      await expect(
        service.setAutoRecharge(account({ paymentMethodId: null }), {
          enabled: true,
          thresholdUsd: 5,
          amountUsd: 10,
        }),
      ).resolves.toBeUndefined();
    });

    // Trigger 10 / top up 10 lands the balance right back on the trigger and charges again.
    it('rejects a trigger that is not below the amount', async () => {
      await expect(
        service.setAutoRecharge(account(), {
          enabled: true,
          thresholdUsd: 10,
          amountUsd: 10,
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('accepts the shape the console offers by default', async () => {
      await service.setAutoRecharge(account(), {
        enabled: true,
        thresholdUsd: 5,
        amountUsd: 10,
      });

      expect(updated[0]).toMatchObject({
        autoRechargeEnabled: true,
        autoRechargeThresholdUsd: '5.0000',
        autoRechargeAmountUsd: '10.0000',
        autoRechargeFailures: 0,
      });
    });
  });

  describe('charging the saved card', () => {
    it('charges off-session and lets the webhook do the crediting', async () => {
      const result = await service.chargeSavedCard(account(), 10);

      expect(result.ok).toBe(true);
      expect(stripeApi.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 1000,
          off_session: true,
          confirm: true,
          metadata: { partnerAccountId: '5', flow: 'auto' },
        }),
      );
      expect(billing.topUpWithin).not.toHaveBeenCalled();
    });

    // European cards routinely demand 3DS, which nobody can satisfy off-session.
    it('reports a decline instead of throwing', async () => {
      stripeApi.paymentIntents.create.mockRejectedValue(
        Object.assign(new Error('auth needed'), {
          code: 'authentication_required',
        }),
      );

      await expect(service.chargeSavedCard(account(), 10)).resolves.toEqual({
        ok: false,
        reason: 'authentication_required',
      });
    });

    it('does nothing without a card on file', async () => {
      await expect(
        service.chargeSavedCard(account({ paymentMethodId: null }), 10),
      ).resolves.toMatchObject({ ok: false });
      expect(stripeApi.paymentIntents.create).not.toHaveBeenCalled();
    });
  });
});
