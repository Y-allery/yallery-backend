import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TranslatableEntityType } from '../translation.catalog';

@Entity('content_translations')
@Index(
  'IDX_content_translations_entity_locale',
  ['entityType', 'entityId', 'locale'],
  {
    unique: true,
  },
)
export class ContentTranslationEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 24 })
  entityType: TranslatableEntityType;

  @Column({ type: 'int' })
  entityId: number;

  @Column({ type: 'varchar', length: 8 })
  locale: string;

  /** Translated user-facing fields, e.g. { name, description }. */
  @Column({ type: 'json' })
  fields: Record<string, string>;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
