import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type PartnerBalanceTransactionKind =
  | 'topup'
  | 'charge'
  | 'refund'
  | 'adjustment';

/**
 * Append-only history of every movement of a partner's money.
 *
 * Signed amounts, and a snapshot of the balance the movement produced: without the
 * snapshot a disputed invoice can only be argued from a replay of the whole table, and any
 * gap in that table silently changes the answer.
 */
@Entity('partner_balance_transactions')
@Index('IDX_partner_balance_tx_account_created', ['accountId', 'createdAt'])
export class PartnerBalanceTransactionEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  accountId: number;

  @Column({ type: 'varchar', length: 16 })
  kind: PartnerBalanceTransactionKind;

  /** Positive adds to the balance, negative takes from it. */
  @Column({ type: 'decimal', precision: 12, scale: 4 })
  amountUsd: string;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  balanceAfterUsd: string;

  /** The generation this movement belongs to, when it is one. */
  @Column({ type: 'int', nullable: true })
  usageId: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  note: string | null;

  /** Which admin credited it, for top-ups. */
  @Column({ type: 'int', nullable: true })
  createdByAdminId: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
