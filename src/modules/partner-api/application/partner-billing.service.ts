import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource, EntityManager } from 'typeorm';
import { PartnerRechargeService } from './partner-recharge.service';
import {
  PARTNER_RECHARGE_JOB_OPTIONS,
  PARTNER_RECHARGE_QUEUE,
  PartnerRechargeJobData,
} from '../infrastructure/queues/partner.queues';
import { PartnerAccountEntity } from '../entities/partner-account.entity';
import { PartnerApiUsageEntity } from '../entities/partner-api-usage.entity';
import {
  PartnerBalanceTransactionEntity,
  PartnerBalanceTransactionKind,
} from '../entities/partner-balance-transaction.entity';
import { PartnerModel } from '../domain/partner-model.catalog';

export interface PartnerHold {
  usageId: number | null;
  accountId: number | null;
  heldUsd: number;
}

/** Money is compared and stored in whole cents-of-a-tenth; four decimals matches the column. */
const round = (value: number): number => +value.toFixed(4);

@Injectable()
export class PartnerBillingService {
  private readonly logger = new Logger(PartnerBillingService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly recharge: PartnerRechargeService,
    @InjectQueue(PARTNER_RECHARGE_QUEUE)
    private readonly rechargeQueue: Queue<PartnerRechargeJobData>,
  ) {}

  async getBalance(accountId: number): Promise<number> {
    const account = await this.dataSource
      .getRepository(PartnerAccountEntity)
      .findOne({ where: { id: accountId } });
    return Number(account?.balanceUsd ?? 0);
  }

  /**
   * Takes the money for a call up front and opens its usage row, in one transaction.
   *
   * The debit is a conditional UPDATE — `SET balance = balance - x WHERE balance >= x` —
   * so InnoDB's row lock decides the winner when two calls race, and the balance can never
   * go negative. Checking the balance and then spending it would let both calls read the
   * same total and pass; with generations that run for minutes, that is not a theoretical
   * window.
   *
   * Charging up front also means a partner cannot start work they cannot pay for. What is
   * unused comes back in `settle`.
   */
  async hold(
    partnerKeyId: number,
    accountId: number | null,
    model: PartnerModel,
    count: number,
  ): Promise<PartnerHold> {
    const heldUsd = round(model.priceUsd * count);

    const hold = await this.dataSource.transaction(async (manager) => {
      if (accountId != null) {
        const debit = await manager
          .createQueryBuilder()
          .update(PartnerAccountEntity)
          .set({ balanceUsd: () => `balanceUsd - ${heldUsd}` })
          .where('id = :id', { id: accountId })
          .andWhere('balanceUsd >= :heldUsd', { heldUsd })
          .andWhere('isActive = 1')
          .execute();

        if (!debit.affected) {
          const balance = await manager
            .getRepository(PartnerAccountEntity)
            .findOne({ where: { id: accountId } });
          // Running dry is the strongest possible signal that a top-up is due, so this call
          // failing still schedules one. It does not rescue this request — the partner is
          // told plainly — but the next one lands on a funded account.
          this.considerRecharge(accountId);
          throw new HttpException(
            {
              error: {
                type: 'insufficient_balance',
                message:
                  `This request costs $${heldUsd.toFixed(3)} and the account balance is ` +
                  `$${Number(balance?.balanceUsd ?? 0).toFixed(2)}. Top up to continue.`,
              },
            },
            HttpStatus.PAYMENT_REQUIRED,
          );
        }
      }

      const usage = await manager.getRepository(PartnerApiUsageEntity).save(
        manager.getRepository(PartnerApiUsageEntity).create({
          partnerKeyId,
          model: model.id,
          capability: model.capability,
          backend: model.backend,
          priceUsd: (0).toFixed(5),
          // Held at what the whole batch would cost us, so a concurrent call sees this one.
          costUsd: round(model.costUsd * count).toFixed(5),
          executionMs: 0,
          status: 'pending',
          failureCode: null,
        }),
      );

      if (accountId != null) {
        await this.writeLedger(manager, {
          accountId,
          kind: 'charge',
          amountUsd: -heldUsd,
          usageId: usage.id,
          note: `${model.id} x${count}`,
        });
      }

      return { usageId: usage.id, accountId, heldUsd };
    });

    // Checked after the debit committed, because this is the moment the balance actually
    // fell — settlement only ever gives money back.
    this.considerRecharge(accountId);
    return hold;
  }

  /**
   * Queues an automatic top-up if this account is set up for one and has dropped under its
   * trigger.
   *
   * Deliberately not awaited: the partner is waiting on a generation, and neither a slow
   * Redis nor a missing card may add latency to it or fail the call. The worker re-checks
   * every condition before it charges anything.
   */
  private considerRecharge(accountId: number | null): void {
    if (accountId == null || !this.rechargeQueue) return;
    this.recharge
      .isDue(accountId)
      .then((due) =>
        due
          ? this.rechargeQueue.add(
              'recharge',
              { accountId },
              PARTNER_RECHARGE_JOB_OPTIONS,
            )
          : null,
      )
      .catch((error) =>
        this.logger.error(
          `could not schedule an automatic top-up for account ${accountId}`,
          error?.stack ?? String(error),
        ),
      );
  }

  /**
   * Closes out a held call: records what happened and returns whatever was not used.
   *
   * A failure refunds in full — the partner asked for an image and did not get one, and
   * billing them for our bad day is how an integration gets abandoned. What it cost us is
   * still written to the usage row, so abuse stays visible even though it is not charged.
   */
  async settle(
    hold: PartnerHold,
    outcome: {
      status: 'succeeded' | 'failed';
      executionMs: number;
      priceUsd: number;
      costUsd: number;
      failureCode: string | null;
    },
  ): Promise<void> {
    const chargedUsd =
      outcome.status === 'succeeded' ? round(outcome.priceUsd) : 0;
    const refundUsd = round(hold.heldUsd - chargedUsd);

    try {
      await this.dataSource.transaction(async (manager) => {
        if (hold.usageId != null) {
          await manager.getRepository(PartnerApiUsageEntity).update(
            { id: hold.usageId },
            {
              status: outcome.status,
              executionMs: outcome.executionMs,
              priceUsd: chargedUsd.toFixed(5),
              costUsd: round(outcome.costUsd).toFixed(5),
              failureCode: outcome.failureCode,
            },
          );
        }

        if (hold.accountId != null && refundUsd > 0) {
          await manager
            .createQueryBuilder()
            .update(PartnerAccountEntity)
            .set({ balanceUsd: () => `balanceUsd + ${refundUsd}` })
            .where('id = :id', { id: hold.accountId })
            .execute();

          await this.writeLedger(manager, {
            accountId: hold.accountId,
            kind: 'refund',
            amountUsd: refundUsd,
            usageId: hold.usageId,
            note:
              outcome.status === 'failed'
                ? `refund: generation failed (${outcome.failureCode ?? 'internal'})`
                : 'refund: unused outputs',
          });
        }
      });
    } catch (error) {
      // The generation already happened; failing the partner's response now would be the
      // worst of both worlds. Log everything needed to repair the row by hand.
      this.logger.error(
        `failed to settle partner usage ${hold.usageId} (account ${hold.accountId}, ` +
          `held $${hold.heldUsd}, charged $${chargedUsd}, refund $${refundUsd}, ` +
          `status ${outcome.status})`,
        error?.stack ?? error?.message ?? String(error),
      );
    }
  }

  /** Admin credit. Returns the new balance. */
  async topUp(
    accountId: number,
    amountUsd: number,
    note: string | null,
    adminId: number | null,
  ): Promise<number> {
    return this.dataSource.transaction((manager) =>
      this.topUpWithin(manager, accountId, amountUsd, note, adminId),
    );
  }

  /**
   * The same credit, joined to a transaction the caller already opened.
   *
   * A card payment has to record the payment and move the balance together or not at all:
   * crediting outside the insert that guards against a redelivered webhook is exactly how
   * one payment becomes two.
   */
  async topUpWithin(
    manager: EntityManager,
    accountId: number,
    amountUsd: number,
    note: string | null,
    adminId: number | null,
  ): Promise<number> {
    const updated = await manager
      .createQueryBuilder()
      .update(PartnerAccountEntity)
      .set({ balanceUsd: () => `balanceUsd + ${round(amountUsd)}` })
      .where('id = :id', { id: accountId })
      .execute();

    if (!updated.affected) {
      throw new HttpException(
        {
          error: { type: 'invalid_request_error', message: 'No such account' },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return this.writeLedger(manager, {
      accountId,
      kind: amountUsd >= 0 ? 'topup' : 'adjustment',
      amountUsd: round(amountUsd),
      usageId: null,
      note,
      adminId,
    });
  }

  /**
   * Appends to the ledger, stamping the balance the movement produced.
   *
   * Re-read inside the same transaction as the UPDATE, so the snapshot is the value that
   * movement actually created rather than one a concurrent debit has already moved past.
   */
  private async writeLedger(
    manager: EntityManager,
    entry: {
      accountId: number;
      kind: PartnerBalanceTransactionKind;
      amountUsd: number;
      usageId: number | null;
      note?: string | null;
      adminId?: number | null;
    },
  ): Promise<number> {
    const account = await manager
      .getRepository(PartnerAccountEntity)
      .findOne({ where: { id: entry.accountId } });
    const balanceAfter = Number(account?.balanceUsd ?? 0);

    await manager.getRepository(PartnerBalanceTransactionEntity).insert({
      accountId: entry.accountId,
      kind: entry.kind,
      amountUsd: entry.amountUsd.toFixed(4),
      balanceAfterUsd: balanceAfter.toFixed(4),
      usageId: entry.usageId,
      note: entry.note ?? null,
      createdByAdminId: entry.adminId ?? null,
    });

    return balanceAfter;
  }
}
