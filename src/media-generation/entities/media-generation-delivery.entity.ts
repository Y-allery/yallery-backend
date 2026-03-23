import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('media_generation_deliveries')
export class MediaGenerationDeliveryEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ type: 'varchar', length: 36 })
  @Index('IDX_media_generation_deliveries_requestId')
  requestId: string;

  @Column({ type: 'int' })
  @Index('IDX_media_generation_deliveries_userId')
  userId: number;

  @Column({ type: 'varchar', length: 64 })
  @Index('IDX_media_generation_deliveries_eventType')
  eventType: string;

  @Column({ type: 'json' })
  payload: Record<string, unknown>;

  @Column({ type: 'boolean', default: false })
  @Index('IDX_media_generation_deliveries_isDelivered')
  isDelivered: boolean;

  @Column({ type: 'timestamp', precision: 6, nullable: true })
  deliveredAt: Date | null;

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
