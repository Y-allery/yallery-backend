import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A partner's credential for the public generation API.
 *
 * Only the hash is stored: a leaked database row must not yield a working key, and the
 * plaintext is shown once at creation. Lookup is by hash, hence the unique index.
 */
@Entity('partner_api_keys')
export class PartnerApiKeyEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  /**
   * The account billed for this key's calls.
   *
   * NULL means an internal key — one we issued deliberately, with no account and no
   * balance check. Self-service keys always have an account; only an admin can mint a key
   * without one.
   */
  @Column({ type: 'int', nullable: true })
  @Index('IDX_partner_api_keys_account')
  accountId: number | null;

  @Column({ type: 'char', length: 64 })
  @Index('UQ_partner_api_keys_hash', { unique: true })
  keyHash: string;

  /** First characters of the plaintext, so a key can be identified in a support thread. */
  @Column({ type: 'varchar', length: 16 })
  keyPrefix: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /** Requests per minute. Null uses the service default. */
  @Column({ type: 'int', nullable: true })
  rateLimitPerMinute: number | null;

  /**
   * When the key stops working. Null never expires.
   *
   * Enforced at authentication rather than by a sweep job, so a trial ends on time even
   * if nothing is running to clean it up.
   */
  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
