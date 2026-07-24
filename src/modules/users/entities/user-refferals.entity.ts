import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { ReferralRewardState } from '../referral/referral-reward.contract';

@Entity('referrals')
@Unique(['code'])
// The cap query also needs (userId, usedAt); it is created in migration
// 1785600000000 because the referrer column is a relation join column.
// synchronize is off, so this decorator is documentation plus a hint for
// anyone regenerating the schema.
@Index('IDX_referrals_reward_state', ['referrerRewardState'])
export class ReferralEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  code: string;

  @ManyToOne(() => UserEntity, (user) => user.referrals)
  user: UserEntity;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => UserEntity)
  usedBy: UserEntity;

  /**
   * When the code was redeemed. createdAt is the code's creation, which says
   * nothing about when the referrer earned it — the daily cap needs the
   * redemption time.
   */
  @Column({ type: 'timestamp', nullable: true })
  usedAt: Date | null;

  /** See REFERRAL_REWARD_STATES. NULL = redeemed before the reward policy. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  referrerRewardState: ReferralRewardState | null;

  @Column({ type: 'timestamp', nullable: true })
  referrerRewardedAt: Date | null;
}
