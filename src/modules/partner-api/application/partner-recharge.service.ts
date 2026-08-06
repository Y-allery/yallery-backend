import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PartnerAccountEntity } from '../entities/partner-account.entity';

/** Long enough that a late webhook cannot look like a second top-up being due. */
export const RECHARGE_COOLDOWN_MINUTES = 10;

/** A card that declines twice will decline a third time; stop and tell the customer. */
export const MAX_CONSECUTIVE_FAILURES = 2;

@Injectable()
export class PartnerRechargeService {
  private readonly logger = new Logger(PartnerRechargeService.name);

  constructor(
    @InjectRepository(PartnerAccountEntity)
    private readonly accounts: Repository<PartnerAccountEntity>,
  ) {}

  /**
   * Takes exclusive ownership of the next top-up for an account, or returns null.
   *
   * Every condition is in the UPDATE rather than read first and checked after. Several
   * generations finishing in the same second all see a balance under the trigger, and a
   * read-then-write would let each of them charge the card. The row lock picks one.
   *
   * `lastRechargeAt` is stamped by the claim, not by the outcome, so the cooldown starts
   * when we decide to charge — before the answer comes back, which is exactly when a second
   * attempt would otherwise slip through.
   */
  async claim(accountId: number): Promise<PartnerAccountEntity | null> {
    const claimed = await this.accounts
      .createQueryBuilder()
      .update(PartnerAccountEntity)
      .set({
        rechargeInFlight: true,
        lastRechargeAt: () => 'CURRENT_TIMESTAMP',
      })
      .where('id = :id', { id: accountId })
      .andWhere('isActive = 1')
      .andWhere('autoRechargeEnabled = 1')
      .andWhere('rechargeInFlight = 0')
      .andWhere('paymentMethodId IS NOT NULL')
      .andWhere('autoRechargeAmountUsd IS NOT NULL')
      .andWhere('balanceUsd < autoRechargeThresholdUsd')
      .andWhere(
        `(lastRechargeAt IS NULL OR lastRechargeAt < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${RECHARGE_COOLDOWN_MINUTES} MINUTE))`,
      )
      .execute();

    if (!claimed.affected) return null;
    return this.accounts.findOne({ where: { id: accountId } });
  }

  async release(accountId: number): Promise<void> {
    await this.accounts.update({ id: accountId }, { rechargeInFlight: false });
  }

  /**
   * Records a declined top-up and, on the second one in a row, switches the rule off.
   *
   * The reason is kept because the partner has to be told something better than "it did not
   * work" — `authentication_required` in particular means their bank wants them in front of
   * a browser, which no amount of retrying will produce.
   */
  async recordFailure(accountId: number, reason: string): Promise<void> {
    const account = await this.accounts.findOne({ where: { id: accountId } });
    if (!account) return;

    const failures = (account.autoRechargeFailures ?? 0) + 1;
    const giveUp = failures >= MAX_CONSECUTIVE_FAILURES;

    await this.accounts.update(
      { id: accountId },
      {
        rechargeInFlight: false,
        autoRechargeFailures: failures,
        ...(giveUp && {
          autoRechargeEnabled: false,
          autoRechargeDisabledReason: `Automatic top-up turned off after ${failures} declined payments (${reason}). Update your card and switch it back on.`,
        }),
      },
    );

    this.logger.warn(
      `auto top-up failed for account ${accountId} (${reason}), failures ${failures}${giveUp ? ' — disabled' : ''}`,
    );
  }

  /** Whether an account is set up for automatic top-ups and currently below the trigger. */
  async isDue(accountId: number): Promise<boolean> {
    const account = await this.accounts.findOne({ where: { id: accountId } });
    if (!account?.autoRechargeEnabled || !account.paymentMethodId) return false;
    return (
      Number(account.balanceUsd) < Number(account.autoRechargeThresholdUsd ?? 0)
    );
  }
}
