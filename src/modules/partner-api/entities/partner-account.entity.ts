import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A customer of the generation API: what they sign into, and what holds their money.
 *
 * The balance is a column rather than a sum over the ledger because it is enforced by an
 * atomic conditional UPDATE (`SET balance = balance - x WHERE balance >= x`). Summing a
 * ledger to decide whether a call may run is a read-then-write, and two requests that
 * read the same total both pass — with generations that take up to five minutes, that
 * window is long enough to spend a whole balance twice over.
 *
 * The ledger stays as the audit trail and must reconcile to this column.
 */
@Entity('partner_accounts')
export class PartnerAccountEntity {
  @PrimaryGeneratedColumn()
  id: number;

  /** Stored lowercased; the unique index is what makes signup idempotent-safe. */
  @Column({ type: 'varchar', length: 190 })
  @Index('UQ_partner_accounts_email', { unique: true })
  email: string;

  @Column({ type: 'varchar', length: 100 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  company: string | null;

  /** USD, prepaid. Never negative — the debit is conditional on covering the charge. */
  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  balanceUsd: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
