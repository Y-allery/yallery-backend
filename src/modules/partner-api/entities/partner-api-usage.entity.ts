import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One row per billable call. Both the partner price and our own cost are recorded at the
 * time of the call: the catalog's numbers move, and an invoice re-derived from today's
 * prices would silently restate last month.
 */
@Entity('partner_api_usage')
@Index('IDX_partner_api_usage_key_created', ['partnerKeyId', 'createdAt'])
export class PartnerApiUsageEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  partnerKeyId: number;

  @Column({ type: 'varchar', length: 64 })
  model: string;

  @Column({ type: 'varchar', length: 32 })
  capability: string;

  /** 'hosted' or 'inhouse' — internal only, never returned to the partner. */
  @Column({ type: 'varchar', length: 16 })
  backend: string;

  @Column({ type: 'decimal', precision: 10, scale: 5 })
  priceUsd: string;

  @Column({ type: 'decimal', precision: 10, scale: 5 })
  costUsd: string;

  @Column({ type: 'int' })
  executionMs: number;

  @Column({ type: 'varchar', length: 16 })
  status: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  failureCode: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
