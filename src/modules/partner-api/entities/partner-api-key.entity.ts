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

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
