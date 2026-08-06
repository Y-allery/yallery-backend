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

  /** Stripe customer holding the saved card. Null until the first payment. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  stripeCustomerId: string | null;

  /**
   * The saved card, and the two digits of it a human can recognise.
   *
   * Nothing else about the card is ours to hold: Stripe keeps the number, we keep a handle
   * to it. Storing more would put this database in PCI scope for no benefit.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  paymentMethodId: string | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  paymentMethodBrand: string | null;

  @Column({ type: 'char', length: 4, nullable: true })
  paymentMethodLast4: string | null;

  @Column({ type: 'boolean', default: false })
  autoRechargeEnabled: boolean;

  /** Charge the card once the balance falls below this. */
  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  autoRechargeThresholdUsd: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  autoRechargeAmountUsd: string | null;

  /**
   * Claimed by a conditional UPDATE before a top-up is attempted.
   *
   * Several generations can cross the threshold within the same second; without this each
   * of them would charge the card. Released when the charge settles or fails.
   */
  @Column({ type: 'boolean', default: false })
  rechargeInFlight: boolean;

  /** Two in a row turns auto top-up off: a card that declines twice will decline again. */
  @Column({ type: 'int', default: 0 })
  autoRechargeFailures: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  autoRechargeDisabledReason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  lastRechargeAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
