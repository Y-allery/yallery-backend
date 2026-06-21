import { PaymentService } from './payment.service';

/**
 * Regression tests for the CRITICAL Adapty webhook double-credit bug.
 * Previously points were credited (and committed) BEFORE the payment row was
 * inserted, with no transaction, a null-able dedup key, and a swallowed catch —
 * so at-least-once retries minted points repeatedly. Crediting must now be
 * idempotency-first and atomic.
 */
describe('PaymentService.processWebhook (Adapty double-credit)', () => {
  const purchasePayload = (overrides: Record<string, any> = {}) =>
    Buffer.from(
      JSON.stringify({
        customer_user_id: 7,
        event_type: 'non_subscription_purchase',
        transaction_id: 'txn_abc',
        event_properties: {
          vendor_product_id: '5000yeps',
          price: 4.99,
          currency: 'USD',
        },
        ...overrides,
      }),
    );

  const createService = ({
    user = { id: 7, points: 100 },
    insertImpl = jest.fn(async () => ({ identifiers: [{ id: 1 }] })),
  }: { user?: any; insertImpl?: jest.Mock } = {}) => {
    const increment = jest.fn(async () => ({ affected: 1 }));
    const manager = {
      getRepository: jest.fn(() => ({ insert: insertImpl, increment })),
    };
    const transaction = jest.fn(async (cb: any) => cb(manager));
    const paymentRepository = { manager: { transaction } };

    const configService = { get: jest.fn(() => 'production') };
    const userService = { findById: jest.fn(async () => user) };
    const notificationGateway = {
      emitProfileUpdate: jest.fn(async () => undefined),
    };
    const rewardService = { getRewardPoints: jest.fn(async () => 5000) };

    const service = new PaymentService(
      configService as any,
      userService as any,
      paymentRepository as any,
      notificationGateway as any,
      rewardService as any,
    );

    return {
      service,
      transaction,
      insert: insertImpl,
      increment,
      notificationGateway,
    };
  };

  it('credits a new purchase exactly once, inside a transaction, via atomic increment', async () => {
    const { service, transaction, insert, increment, notificationGateway } =
      createService();

    await service.processWebhook(purchasePayload());

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1); // payment row inserted first
    expect(increment).toHaveBeenCalledWith({ id: 7 }, 'points', 5000);
    expect(notificationGateway.emitProfileUpdate).toHaveBeenCalledWith('7');
  });

  it('does NOT re-credit on a duplicate (retried) webhook — unique-index conflict is swallowed', async () => {
    const dupErr: any = new Error('duplicate');
    dupErr.code = 'ER_DUP_ENTRY';
    dupErr.errno = 1062;
    const insertImpl = jest.fn(async () => {
      throw dupErr;
    });
    const { service, increment, notificationGateway } = createService({
      insertImpl,
    });

    await expect(service.processWebhook(purchasePayload())).resolves.toBeUndefined();

    expect(increment).not.toHaveBeenCalled(); // no second credit
    expect(notificationGateway.emitProfileUpdate).not.toHaveBeenCalled();
  });

  it('refuses to credit a purchase that has no stable transaction id', async () => {
    const { service, transaction, increment } = createService();

    await service.processWebhook(
      purchasePayload({ transaction_id: undefined, payment_intent_id: undefined }),
    );

    expect(transaction).not.toHaveBeenCalled();
    expect(increment).not.toHaveBeenCalled();
  });

  it('rethrows a genuine DB failure so the controller returns 500 and Adapty retries', async () => {
    const insertImpl = jest.fn(async () => {
      throw new Error('connection lost');
    });
    const { service } = createService({ insertImpl });

    await expect(service.processWebhook(purchasePayload())).rejects.toThrow(
      'connection lost',
    );
  });
});
