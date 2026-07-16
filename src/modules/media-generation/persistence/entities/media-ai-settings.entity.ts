import { Column, Entity, Index } from 'typeorm';
import { TimeStampEntity } from 'src/core/database/entities/time-stamp.entity';

export interface MediaAISettingsJson {
  minImages?: number;
  maxImages?: number;
  maxPromptLength?: number;
  durations?: number[];
  pricing?: {
    strategy?: 'fixed' | 'per_second';
    creditsPerSecond?: number;
  };
  contestOnly?: boolean;
  characterOrientations?: Array<'image' | 'video'>;
  defaultCharacterOrientation?: 'image' | 'video';
  keepOriginalSound?: boolean;
  matchSourceDuration?: boolean;
  outputFrameRate?: number;
}

@Entity('media_ai_settings')
@Index('IDX_media_ai_settings_capability_isActive', ['capability', 'isActive'])
@Index(
  'IDX_media_ai_settings_aiService_capability',
  ['aiService', 'capability'],
  {
    unique: true,
  },
)
export class MediaAISettingsEntity extends TimeStampEntity {
  @Column({ type: 'varchar', length: 120 })
  aiService: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 120 })
  provider: string;

  @Column({ type: 'varchar', length: 120 })
  capability: string;

  @Column({ type: 'int', default: 0 })
  cost: number;

  @Column({ type: 'json', nullable: true })
  settings: MediaAISettingsJson | null;

  @Column({ type: 'boolean', default: true, name: 'isActive' })
  isActive: boolean;
}
