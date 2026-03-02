import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { TimeStampEntity } from '../../database/entities/time-stamp.entity';
import { TagEntity } from '../../tag/entities/tag.entity';

@Entity('memes')
export class MemeEntity extends TimeStampEntity {
  @Column({ type: 'varchar', length: 255 })
  @Index()
  name: string;

  @Column({ type: 'varchar', length: 1024, nullable: true, name: 'referenceVideoUrl' })
  referenceVideoUrl: string | null;

  @Column({ type: 'varchar', length: 1024, nullable: true, name: 'referenceImageUrl' })
  referenceImageUrl: string | null;

  @ManyToOne(() => TagEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tagId' })
  tag: TagEntity;

  @Column({ type: 'boolean', default: true, name: 'isActive' })
  @Index()
  isActive: boolean;
}
