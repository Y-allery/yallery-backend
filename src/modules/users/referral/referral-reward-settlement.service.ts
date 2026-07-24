import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RewardService } from 'src/modules/billing/rewards/reward.service';
import { RewardTypeEnum } from 'src/modules/billing/rewards/types/reward-type.enum';
import { UserActivityEntity } from 'src/modules/engagement/user-activity/entities/user-activity.entity';
import { USER_ACTIVITY_TYPES } from 'src/modules/engagement/user-activity/types/user-activity.constants';
import { NotificationGateway } from 'src/modules/notifications/notification.gateway';
import { ReferralEntity } from '../entities/user-refferals.entity';
import { UserEntity } from '../entities/user.entity';
import { REFERRAL_REWARD_STATES } from './referral-reward.contract';

interface PendingReferralRow {
  id: number;
  referrerId: number;
  refereeId: number;
}

/**
 * Pays the deferred half of the referral bonus.
 *
 * Redeeming a code credits the invited user immediately but leaves the
 * referrer's half 'pending' until that user actually generates something —
 * a farm of idle signups must not mint points. This sweep is what turns
 * pending into paid; hooking the media-generation finalizer directly would
 * couple the generation hot path to the points economy for a reward nobody
 * is waiting on in real time.
 */
@Injectable()
export class ReferralRewardSettlementService {
  private readonly logger = new Logger(ReferralRewardSettlementService.name);
  private readonly batchSize = 200;
  /** Work budget per run; the cursor below resumes the rest next tick. */
  private readonly maxRowsPerRun = 2000;

  /**
   * Rolling scan position. Referrals whose invited user never generates stay
   * pending forever, so restarting from the oldest row every run would let
   * them monopolise the budget and starve everything behind them.
   */
  private cursorId = 0;
  private isRunning = false;

  constructor(
    @InjectRepository(ReferralEntity)
    private readonly referralRepository: Repository<ReferralEntity>,
    private readonly rewardService: RewardService,
    @Inject(forwardRef(() => NotificationGateway))
    private readonly notificationGateway: NotificationGateway,
    private readonly dataSource: DataSource,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleCron(): Promise<void> {
    try {
      await this.settlePendingRewards();
    } catch (error) {
      this.logger.error(
        'Referral reward settlement sweep failed',
        error?.stack ?? error?.message ?? String(error),
      );
    }
  }

  async settlePendingRewards(): Promise<{ scanned: number; settled: number }> {
    // A run slower than the cron interval would otherwise overlap itself and
    // re-scan the same rows; the conditional UPDATE keeps that correct, but
    // the wasted queries are pure load.
    if (this.isRunning) {
      return { scanned: 0, settled: 0 };
    }
    this.isRunning = true;

    let scanned = 0;
    let settled = 0;

    try {
      const rewardPoints = await this.rewardService.getRewardPointsOrDefault(
        RewardTypeEnum.REFERRAL_REWARD,
        500,
      );

      while (scanned < this.maxRowsPerRun) {
        const rows = await this.loadPendingBatch();

        if (!rows.length) {
          this.cursorId = 0;
          break;
        }

        scanned += rows.length;
        this.cursorId = rows[rows.length - 1].id;

        const generatedRefereeIds = await this.findRefereesWithGeneration(
          rows.map((row) => row.refereeId),
        );

        for (const row of rows) {
          if (!generatedRefereeIds.has(row.refereeId)) {
            continue;
          }
          if (await this.payReferrer(row, rewardPoints)) {
            settled += 1;
          }
        }

        if (rows.length < this.batchSize) {
          this.cursorId = 0;
          break;
        }
      }
    } finally {
      this.isRunning = false;
    }

    if (settled) {
      this.logger.log(
        `Referral settlement: ${settled} referrer reward(s) paid out of ${scanned} pending row(s) scanned`,
      );
    }

    return { scanned, settled };
  }

  private async loadPendingBatch(): Promise<PendingReferralRow[]> {
    const rows = await this.referralRepository
      .createQueryBuilder('referral')
      .select('referral.id', 'id')
      .addSelect('referral.userId', 'referrerId')
      .addSelect('referral.usedById', 'refereeId')
      .where('referral.referrerRewardState = :state', {
        state: REFERRAL_REWARD_STATES.PENDING,
      })
      .andWhere('referral.id > :cursorId', { cursorId: this.cursorId })
      .andWhere('referral.usedById IS NOT NULL')
      .orderBy('referral.id', 'ASC')
      .limit(this.batchSize)
      .getRawMany<{
        id: number | string;
        referrerId: number | string;
        refereeId: number | string;
      }>();

    return rows.map((row) => ({
      id: Number(row.id),
      referrerId: Number(row.referrerId),
      refereeId: Number(row.refereeId),
    }));
  }

  /** One query per batch instead of one per row. */
  private async findRefereesWithGeneration(
    refereeIds: number[],
  ): Promise<Set<number>> {
    if (!refereeIds.length) {
      return new Set();
    }

    const rows = await this.dataSource
      .getRepository(UserActivityEntity)
      .createQueryBuilder('activity')
      .select('DISTINCT activity.userId', 'userId')
      .where('activity.type = :type', {
        type: USER_ACTIVITY_TYPES.MEDIA_GENERATION_SPENT,
      })
      .andWhere('activity.userId IN (:...refereeIds)', { refereeIds })
      .getRawMany<{ userId: number | string }>();

    return new Set(rows.map((row) => Number(row.userId)));
  }

  /**
   * The conditional UPDATE is the gate: only the transaction that flips
   * pending -> paid credits the points, so a concurrent sweep or a retried run
   * cannot pay the same referral twice.
   */
  private async payReferrer(
    row: PendingReferralRow,
    rewardPoints: number,
  ): Promise<boolean> {
    try {
      const paid = await this.dataSource.transaction(async (manager) => {
        const claim = await manager
          .getRepository(ReferralEntity)
          .createQueryBuilder()
          .update(ReferralEntity)
          .set({
            referrerRewardState: REFERRAL_REWARD_STATES.PAID,
            referrerRewardedAt: new Date(),
          })
          .where('id = :id', { id: row.id })
          .andWhere('referrerRewardState = :state', {
            state: REFERRAL_REWARD_STATES.PENDING,
          })
          .execute();

        if (!claim.affected) {
          return false;
        }

        await manager
          .getRepository(UserEntity)
          .increment({ id: row.referrerId }, 'points', rewardPoints);
        return true;
      });

      if (paid) {
        await this.notificationGateway
          .emitProfileUpdate(row.referrerId.toString())
          .catch(() => undefined);
      }
      return paid;
    } catch (error) {
      // One bad row must not abort the sweep; it stays pending and is retried.
      this.logger.error(
        `Failed to settle referral ${row.id} for referrer ${row.referrerId}`,
        error?.stack ?? error?.message ?? String(error),
      );
      return false;
    }
  }
}
