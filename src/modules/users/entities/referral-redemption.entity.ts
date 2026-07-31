import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { ReferralEntity } from './user-refferals.entity';
import { ReferralRewardState } from '../referral/referral-reward.contract';

/**
 * One row per person who redeemed a code. The code itself no longer records who used
 * it: a link gets shared into a group chat or a story, and every reader after the first
 * used to hit "already used".
 *
 * `redeemedById` is unique across the whole table, not per referral — redeeming any code
 * consumes the invited user's one-time bonus, so a second redemption is meaningless
 * whichever code it names. That uniqueness is also the concurrency gate: the insert
 * either wins or fails, so two simultaneous requests cannot both credit the referrer.
 */
@Entity('referral_redemptions')
@Index('IDX_referral_redemptions_reward_state', ['rewardState', 'id'])
export class ReferralRedemptionEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index('IDX_referral_redemptions_referral')
  referralId: number;

  @ManyToOne(() => ReferralEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referralId' })
  referral: ReferralEntity;

  @Column({ unique: true })
  redeemedById: number;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'redeemedById' })
  redeemedBy: UserEntity;

  @Column({ type: 'timestamp' })
  redeemedAt: Date;

  /** See REFERRAL_REWARD_STATES. NULL = redeemed before the reward policy existed. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  rewardState: ReferralRewardState | null;

  @Column({ type: 'timestamp', nullable: true })
  rewardedAt: Date | null;
}
