
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('payments')
export class PaymentEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, nullable: true })
  paymentIntentId: string;

  @Column()
  userId: number;

  @Column()
  productId: string;

  @Column('int')
  amount: number;

  @Column()
  currency: string;

  @Column({ default: 'pending' })
  status: string;

  /** Adapty sandbox/review purchase, not real revenue. */
  @Column({ default: false })
  isTest: boolean;

  /**
   * Points actually credited for THIS purchase, frozen at credit time.
   * Nullable because rows inserted before this column existed have no value —
   * readers must fall back to recomputing from the (mutable) reward config
   * for those, never assume it's always populated.
   */
  @Column({ type: 'int', nullable: true })
  pointsCredited: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
