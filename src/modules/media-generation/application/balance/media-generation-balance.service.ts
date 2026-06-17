import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NotificationGateway } from 'src/modules/notifications/notification.gateway';
import { MediaGenerationChargeEntity } from 'src/modules/media-generation/persistence/entities/media-generation-charge.entity';

export interface ReserveCreditsParams {
  userId: number;
  amount: number;
  chargeKey: string;
  aiService?: string | null;
}

/**
 * Owns every mutation of a user's credit balance for media generation.
 *
 * Credits are reserved (debited) atomically at enqueue time and refunded if the
 * job fails terminally. This closes three correctness bugs the previous
 * deduct-on-success flow had:
 *   - double-charge on BullMQ retry (idempotent on `chargeKey`),
 *   - no refund when generation/persistence fails (explicit `refund`),
 *   - check-then-deduct race that let concurrent requests overspend
 *     (single conditional `UPDATE ... WHERE points >= amount`).
 */
@Injectable()
export class MediaGenerationBalanceService {
  private readonly logger = new Logger(MediaGenerationBalanceService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  /**
   * Atomically debit `amount` credits from the user and record the reservation.
   * Idempotent on `chargeKey`; throws `BadRequestException('Not enough credits')`
   * when the balance is insufficient (the conditional UPDATE prevents the
   * balance from going negative under concurrent requests).
   */
  async reserve(params: ReserveCreditsParams): Promise<void> {
    const { userId, amount, chargeKey, aiService = null } = params;

    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(MediaGenerationChargeEntity, {
        where: { chargeKey },
      });
      if (existing) {
        // Already reserved for this key — nothing more to debit.
        return;
      }

      const result = await manager.query(
        'UPDATE `users` SET `points` = `points` - ? WHERE `id` = ? AND `points` >= ?',
        [amount, userId, amount],
      );

      if (!result?.affectedRows) {
        throw new BadRequestException('Not enough credits');
      }

      await manager.insert(MediaGenerationChargeEntity, {
        chargeKey,
        userId,
        amount,
        status: 'reserved',
        aiService,
      });
    });

    await this.safeEmitProfileUpdate(userId);
  }

  /** Record the BullMQ job id on an existing reservation (best-effort, for tracing). */
  async attachJob(
    chargeKey: string,
    jobId: string | number | null | undefined,
  ): Promise<void> {
    if (!jobId) {
      return;
    }

    await this.dataSource
      .getRepository(MediaGenerationChargeEntity)
      .update({ chargeKey }, { jobId: String(jobId) });
  }

  /**
   * Refund a previously reserved charge and credit the points back.
   * Idempotent: a reservation can only be refunded once (status flips
   * `reserved` -> `refunded` inside the transaction), so duplicate `failed`
   * events or retries never double-refund.
   */
  async refund(chargeKey: string | null | undefined): Promise<void> {
    if (!chargeKey) {
      return;
    }

    let refundedUserId: number | null = null;

    await this.dataSource.transaction(async (manager) => {
      const charge = await manager.findOne(MediaGenerationChargeEntity, {
        where: { chargeKey },
      });

      if (!charge || charge.status !== 'reserved') {
        return;
      }

      await manager.query(
        'UPDATE `users` SET `points` = `points` + ? WHERE `id` = ?',
        [charge.amount, charge.userId],
      );

      charge.status = 'refunded';
      await manager.save(charge);
      refundedUserId = charge.userId;
    });

    if (refundedUserId !== null) {
      await this.safeEmitProfileUpdate(refundedUserId);
    }
  }

  private async safeEmitProfileUpdate(userId: number): Promise<void> {
    try {
      await this.notificationGateway.emitProfileUpdate(userId.toString());
    } catch (error) {
      this.logger.warn(
        `Failed to emit profile update for user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
