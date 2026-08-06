import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type PartnerJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type PartnerCallbackStatus = 'none' | 'pending' | 'delivered' | 'failed';

/**
 * One row per generation call, synchronous or not.
 *
 * Kept apart from `partner_api_usage` on purpose: that table is the money, it is what the
 * admin and portal aggregate over, and it is never pruned. This one carries the operational
 * payload — the request, the result, the delivery state of the callback — which is bulky,
 * only interesting for a few weeks, and has no business slowing down a revenue query.
 *
 * Written for the synchronous path too, so `GET /v1/jobs/{id}` answers for every call and
 * support has one place to look.
 */
@Entity('partner_jobs')
@Index('IDX_partner_jobs_key_created', ['partnerKeyId', 'createdAt'])
@Index('IDX_partner_jobs_account_created', ['accountId', 'createdAt'])
export class PartnerJobEntity {
  @PrimaryGeneratedColumn()
  id: number;

  /** What the partner sees. Random, not the primary key: a sequence publishes our volume. */
  @Column({ type: 'varchar', length: 40 })
  @Index('UQ_partner_jobs_public_id', { unique: true })
  publicId: string;

  @Column({ type: 'int' })
  partnerKeyId: number;

  @Column({ type: 'int', nullable: true })
  accountId: number | null;

  /** The billing row this job settles against. */
  @Column({ type: 'int', nullable: true })
  usageId: number | null;

  /** Debited before the job was queued; whatever is unused is refunded at settlement. */
  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  heldUsd: string;

  @Column({ type: 'varchar', length: 32 })
  capability: string;

  @Column({ type: 'varchar', length: 64 })
  model: string;

  @Column({ type: 'varchar', length: 16, default: 'queued' })
  status: PartnerJobStatus;

  /** Normalized input. The worker re-reads it from here rather than from the queue payload. */
  @Column({ type: 'json' })
  request: Record<string, unknown>;

  @Column({ type: 'json', nullable: true })
  result: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  errorType: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  errorMessage: string | null;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  callbackUrl: string | null;

  @Column({ type: 'varchar', length: 16, default: 'none' })
  callbackStatus: PartnerCallbackStatus;

  /** Stable across retries, so the partner can discard a duplicate delivery. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  callbackDeliveryId: string | null;

  @Column({ type: 'int', default: 0 })
  callbackAttempts: number;

  @Column({ type: 'int', nullable: true })
  callbackLastStatus: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  callbackLastError: string | null;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  finishedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
