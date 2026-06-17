import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type MediaGenerationChargeStatus = 'reserved' | 'refunded';

/**
 * Ledger of credit reservations for media-generation jobs.
 *
 * Each row records that `amount` points were atomically debited from a user
 * before a generation job was enqueued. `chargeKey` is unique, which makes the
 * reservation idempotent (a job that is retried cannot be charged twice) and
 * gives the worker a stable handle to refund the reservation if the job
 * ultimately fails.
 */
@Entity('media_generation_charges')
export class MediaGenerationChargeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('IDX_media_generation_charges_charge_key', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  chargeKey: string;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'int' })
  amount: number;

  @Column({ type: 'varchar', length: 20, default: 'reserved' })
  status: MediaGenerationChargeStatus;

  @Column({ type: 'varchar', length: 64, nullable: true })
  jobId: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  aiService: string | null;

  @CreateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP(6)',
    onUpdate: 'CURRENT_TIMESTAMP(6)',
  })
  updatedAt: Date;
}
