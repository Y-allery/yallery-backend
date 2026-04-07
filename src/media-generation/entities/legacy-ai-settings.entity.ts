import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';
import { TimeStampEntity } from '../../database/entities/time-stamp.entity';

@Entity('ai_settings')
export class AISettingsEntity extends TimeStampEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', unique: true, name: 'aiService' })
  @Index()
  aiService: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'json' })
  allowedOrientations: string[];

  @Column({ type: 'int' })
  minImages: number;

  @Column({ type: 'int' })
  maxImages: number;

  @Column({ type: 'int' })
  maxPromptLength: number;

  @Column({ type: 'json', nullable: true })
  sizes: string[] | null;

  @Column({ type: 'json', nullable: true })
  qualityOptions: string[] | null;

  @Column({ type: 'json', nullable: true })
  styles: string[] | null;

  @Column({ type: 'int' })
  cost: number;

  @Column({ type: 'varchar', nullable: true, name: 'apiModel' })
  apiModel: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: ['image', 'video', 'audio'], default: 'image' })
  type: 'image' | 'video' | 'audio';

  @Column({ type: 'boolean', default: false, name: 'isArtem' })
  isArtem: boolean;

  @Column({ type: 'boolean', default: true, name: 'isActive' })
  isActive: boolean;
}
