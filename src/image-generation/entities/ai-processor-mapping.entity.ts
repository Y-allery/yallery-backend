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

  @Column({ type: 'varchar', unique: true, name: 'aiService' })
  @Index()
  aiService: string;

  @Column({ type: 'enum', enum: ProcessorType, name: 'processorType' })
  processorType: ProcessorType;

  @Column({ type: 'varchar', nullable: true, name: 'queueName' })
  queueName: string | null;

  @Column({ type: 'int', default: 60 })
  concurrency: number;

  @Column({ type: 'int', default: 120000, name: 'lockDuration' })
  lockDuration: number;

  @Column({ type: 'boolean', default: false, name: 'isEdit' })
  isEdit: boolean;

  @Column({ type: 'boolean', nullable: true, name: 'completedNotificationParam' })
  completedNotificationParam: boolean | null;
}

