import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type PartnerPaymentKind = 'manual' | 'auto';

export type PartnerPaymentStatus = 'pending' | 'succeeded' | 'failed';

/**
 * One row per attempt to take money from a card.
 *
 * `stripeEventId` is unique and that is the whole point: Stripe redelivers a webhook until
 * it gets a 2xx, and a duplicate delivery that credits the balance twice is money we did not
 * receive. The insert is the idempotency check — a second attempt hits the index and stops.
 *
 * The balance itself still moves through `partner_balance_transactions`, so the ledger
 * remains the single account of where a dollar came from.
 */
@Entity('partner_payments')
@Index('IDX_partner_payments_account_created', ['accountId', 'createdAt'])
export class PartnerPaymentEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  accountId: number;

  /** Null while the payment is still ours alone — set when a Stripe event lands. */
  @Column({ type: 'varchar', length: 80, nullable: true })
  @Index('UQ_partner_payments_event', { unique: true })
  stripeEventId: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  paymentIntentId: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  checkoutSessionId: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  amountUsd: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: PartnerPaymentStatus;

  @Column({ type: 'varchar', length: 16 })
  kind: PartnerPaymentKind;

  @Column({ type: 'varchar', length: 120, nullable: true })
  failureCode: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
