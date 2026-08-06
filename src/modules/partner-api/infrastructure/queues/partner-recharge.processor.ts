import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PartnerPaymentService } from '../../application/partner-payment.service';
import { PartnerRechargeService } from '../../application/partner-recharge.service';
import {
  PARTNER_RECHARGE_QUEUE,
  PartnerRechargeJobData,
} from './partner.queues';

/**
 * Charges the saved card when a balance falls under its trigger.
 *
 * Off the request path on purpose: the partner is waiting for an image, and a card
 * authorisation has no business adding seconds to that. The generation that crossed the
 * trigger is paid for out of what was already there; this tops the account back up for the
 * ones after it.
 */
@Injectable()
@Processor(PARTNER_RECHARGE_QUEUE, { concurrency: 2 })
export class PartnerRechargeProcessor extends WorkerHost {
  private readonly logger = new Logger(PartnerRechargeProcessor.name);

  constructor(
    private readonly recharge: PartnerRechargeService,
    private readonly payments: PartnerPaymentService,
  ) {
    super();
  }

  async process(job: Job<PartnerRechargeJobData>): Promise<void> {
    // The claim re-checks everything: by the time this runs the balance may have been topped
    // up by hand, the rule switched off, or another worker may already be charging.
    const account = await this.recharge.claim(job.data.accountId);
    if (!account) return;

    const amountUsd = Number(account.autoRechargeAmountUsd);
    const result = await this.payments.chargeSavedCard(account, amountUsd);

    if (!result.ok) {
      await this.recharge.recordFailure(
        account.id,
        result.reason ?? 'declined',
      );
      return;
    }

    // Released here rather than waiting for the webhook: if that delivery is slow or lost,
    // a stuck flag would leave the account unable to ever top up again. The cooldown
    // stamped by the claim is what prevents a second charge in the meantime.
    await this.recharge.release(account.id);
    this.logger.log(
      `auto top-up of $${amountUsd.toFixed(2)} charged for account ${account.id}`,
    );
  }
}
