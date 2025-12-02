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

  @Column({ type: 'varchar', unique: true })
  @Index()
  ai_service: string; // 'aura_flow', 'flux', 'realistic_vision', etc.

  @Column({ type: 'varchar' })
  name: string; // 'Ideogram', 'FLUX AI', etc.

  @Column({ type: 'json' })
  allowedOrientations: string[]; // ['horizontal', 'vertical']

  @Column({ type: 'int' })
  minImages: number;

  @Column({ type: 'int' })
  maxImages: number;

  @Column({ type: 'int' })
  maxPromptLength: number;

  @Column({ type: 'json', nullable: true })
  sizes: string[] | null; // ['1024x1024', '1536x640', ...]

  @Column({ type: 'json', nullable: true })
  qualityOptions: string[] | null;

  @Column({ type: 'json', nullable: true })
  styles: string[] | null;

  @Column({ type: 'int' })
  cost: number;

  @Column({ type: 'varchar', nullable: true })
  api_model: string | null; // 'fal-ai/ideogram/v2', etc.

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: ['image', 'video'], default: 'image' })
  type: 'image' | 'video';

  @Column({ type: 'boolean', default: false })
  is_artem: boolean;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;
}

