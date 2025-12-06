import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';
import { TimeStampEntity } from '../../database/entities/time-stamp.entity';

export enum ProcessorType {
  FAL_AI = 'fal_ai',
  X_ROUTER = 'x_router',
  CUSTOM = 'custom',
}

@Entity('ai_processor_mapping')
export class AIProcessorMappingEntity extends TimeStampEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', unique: true })
  @Index()
  ai_service: string;

  @Column({ type: 'enum', enum: ProcessorType })
  processor_type: ProcessorType;

  @Column({ type: 'varchar', nullable: true })
  queue_name: string | null;

  @Column({ type: 'int', default: 60 })
  concurrency: number;

  @Column({ type: 'int', default: 120000 })
  lock_duration: number;

  @Column({ type: 'boolean', default: false })
  is_edit: boolean;

  @Column({ type: 'boolean', nullable: true })
  completed_notification_param: boolean | null;
}

