import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('media_generation_requests')
export class MediaGenerationRequestEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'int' })
  @Index('IDX_media_generation_requests_userId')
  userId: number;

  @Column({ type: 'varchar', length: 32 })
  @Index('IDX_media_generation_requests_modality')
  modality: string;

  @Column({ type: 'varchar', length: 32 })
  provider: string;

  @Column({ type: 'varchar', length: 191, nullable: true })
  @Index('IDX_media_generation_requests_providerJobId')
  providerJobId: string | null;

  @Column({ type: 'varchar', length: 32 })
  @Index('IDX_media_generation_requests_status')
  status: string;

  @Column({ type: 'json' })
  requestPayload: Record<string, unknown>;

  @Column({ type: 'json', nullable: true })
  responsePayload: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  errorCode: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  failedAt: Date | null;

  @Column({
    type: 'timestamp',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
  })
  createdAt: Date;

  @Column({
    type: 'timestamp',
    precision: 6,
    default: () => 'CURRENT_TIMESTAMP(6)',
    onUpdate: 'CURRENT_TIMESTAMP(6)',
  })
  updatedAt: Date;
}
