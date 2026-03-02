import { Entity, Column, Index } from 'typeorm';
import { TimeStampEntity } from '../../database/entities/time-stamp.entity';

@Entity('memes')
export class MemeEntity extends TimeStampEntity {
  @Column({ type: 'varchar', length: 255 })
  @Index()
  name: string;

  @Column({ type: 'varchar', length: 1024, nullable: true, name: 'referenceVideoUrl' })
  referenceVideoUrl: string | null;

  @Column({ type: 'varchar', length: 1024, nullable: true, name: 'referenceImageUrl' })
  referenceImageUrl: string | null;

  @Column({ type: 'boolean', default: true, name: 'isActive' })
  @Index()
  isActive: boolean;
}
