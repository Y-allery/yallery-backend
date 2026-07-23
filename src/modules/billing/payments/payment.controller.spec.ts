import { PaymentController } from './payment.controller';

/**
 * Adapty has no HMAC signing — its only webhook auth is a static value
 * configured in the Adapty Dashboard, echoed back as the Authorization
 * header. Covers: fail-open when unconfigured (back-compat), reject on
 * mismatch/missing header, accept on either the prod or sandbox token.
 */
describe('PaymentController.handlePaymentWebhook (Adapty auth)', () => {
  const makeController = (config: Record<string, string | null> = {}) => {
    const processWebhook = jest.fn(async () => undefined);
    const paymentService = { processWebhook } as any;
    const providerRuntimeConfigService = {
      getString: jest.fn(async (key: string) => config[key] ?? null),
    } as any;

    const controller = new PaymentController(
      paymentService,
      providerRuntimeConfigService,
    );
    return { controller, processWebhook };
  };

  const makeReqRes = (body: object, authorization?: string) => {
    const req = {
      body: Buffer.from(JSON.stringify(body)),
      headers: authorization ? { authorization } : {},
      ip: '1.2.3.4',
    } as any;
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const res = { status } as any;
    return { req, res, status, json };
  };

  it('rejects with 401 when a token IS configured but the header is missing', async () => {
    const { controller, processWebhook } = makeController({
      ADAPTY_WEBHOOK_AUTH_TOKEN: 'secret-prod',
    });
    const { req, res, status } = makeReqRes({ adapty_check: 'ping' });

    await controller.handlePaymentWebhook(req, res);

    expect(status).toHaveBeenCalledWith(401);
    expect(processWebhook).not.toHaveBeenCalled();
  });

  it('rejects with 401 when the header does not match either configured token', async () => {
    const { controller, processWebhook } = makeController({
      ADAPTY_WEBHOOK_AUTH_TOKEN: 'secret-prod',
      ADAPTY_WEBHOOK_AUTH_TOKEN_SANDBOX: 'secret-sandbox',
    });
    const { req, res, status } = makeReqRes(
      { adapty_check: 'ping' },
      'wrong-value',
    );

    await controller.handlePaymentWebhook(req, res);

    expect(status).toHaveBeenCalledWith(401);
    expect(processWebhook).not.toHaveBeenCalled();
  });

  it('accepts a request matching the production token', async () => {
    const { controller, processWebhook } = makeController({
      ADAPTY_WEBHOOK_AUTH_TOKEN: 'secret-prod',
    });
    const { req, res, status } = makeReqRes(
      { event_type: 'non_subscription_purchase' },
      'secret-prod',
    );

    await controller.handlePaymentWebhook(req, res);

    expect(status).toHaveBeenCalledWith(200);
    expect(processWebhook).toHaveBeenCalledTimes(1);
  });

  it('accepts a request matching the sandbox token when the prod token differs', async () => {
    const { controller, processWebhook } = makeController({
      ADAPTY_WEBHOOK_AUTH_TOKEN: 'secret-prod',
      ADAPTY_WEBHOOK_AUTH_TOKEN_SANDBOX: 'secret-sandbox',
    });
    const { req, res, status } = makeReqRes(
      { event_type: 'non_subscription_purchase' },
      'secret-sandbox',
    );

    await controller.handlePaymentWebhook(req, res);

    expect(status).toHaveBeenCalledWith(200);
    expect(processWebhook).toHaveBeenCalledTimes(1);
  });

  it('fails OPEN (back-compat) when no token is configured on either side', async () => {
    const { controller, processWebhook } = makeController();
    const { req, res, status } = makeReqRes({
      event_type: 'non_subscription_purchase',
    });

    await controller.handlePaymentWebhook(req, res);

    expect(status).toHaveBeenCalledWith(200);
    expect(processWebhook).toHaveBeenCalledTimes(1);
  });

  it('answers the adapty_check verification handshake once authorized', async () => {
    const { controller } = makeController({
      ADAPTY_WEBHOOK_AUTH_TOKEN: 'secret-prod',
    });
    const { req, res, json } = makeReqRes(
      { adapty_check: 'handshake-value' },
      'secret-prod',
    );

    await controller.handlePaymentWebhook(req, res);

    expect(json).toHaveBeenCalledWith({
      adapty_check_response: 'handshake-value',
    });
  });
});
