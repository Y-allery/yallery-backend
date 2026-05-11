export const PAYMENT_SWAGGER = {
  handleWebhook: {
    summary: 'Handle payment webhook',
    description: `Process payment webhook events from Adapty payment provider. Handles subscription updates, purchases, and payment status changes.

**Webhook Events:**
- Subscription activations and renewals
- Payment failures
- Subscription cancellations
- Refunds

**Security:** This endpoint uses raw body parsing for webhook signature verification.`,
    responses: {
      success: { status: 200, description: 'Webhook processed successfully' },
      badRequest: { status: 400, description: 'Invalid webhook data' },
      internalError: { status: 500, description: 'Error processing webhook' }
    }
  }
};
