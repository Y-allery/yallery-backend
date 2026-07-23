export const PAYMENT_SWAGGER = {
  handleWebhook: {
    summary: 'Handle payment webhook',
    description: `Process payment webhook events from Adapty payment provider. Handles subscription updates, purchases, and payment status changes.

**Webhook Events:**
- Subscription activations and renewals
- Payment failures
- Subscription cancellations
- Refunds

**Security:** Verifies the \`Authorization\` header against ADAPTY_WEBHOOK_AUTH_TOKEN(_SANDBOX) (admin provider settings) — the same static value must be set in the Adapty Dashboard under Integrations -> Webhooks, since Adapty has no HMAC signing. Rejects with 401 on a mismatch; accepts (with a warning logged) if no token is configured yet.`,
    responses: {
      success: { status: 200, description: 'Webhook processed successfully' },
      badRequest: { status: 400, description: 'Invalid webhook data' },
      internalError: { status: 500, description: 'Error processing webhook' }
    }
  }
};
