import { Column, Entity, Index } from 'typeorm';
import { TimeStampEntity } from 'src/core/database/entities/time-stamp.entity';

@Entity('provider_runtime_settings')
@Index('IDX_provider_runtime_settings_key', ['key'], { unique: true })
@Index('IDX_provider_runtime_settings_provider_group', ['provider', 'group'])
export class ProviderRuntimeSettingEntity extends TimeStampEntity {
  @Column({ type: 'varchar', length: 120 })
  key: string;

  @Column({ type: 'varchar', length: 60 })
  provider: string;

  @Column({ type: 'varchar', length: 80 })
  group: string;

  @Column({ type: 'varchar', length: 160 })
  label: string;

  @Column({ type: 'varchar', length: 40 })
  type: string;

  @Column({ type: 'varchar', length: 60 })
  validationKind: string;

  @Column({ type: 'boolean', default: false })
  isSecret: boolean;

  @Column({ type: 'text', nullable: true })
  valueEncrypted: string | null;

  @Column({ type: 'text', nullable: true })
  valuePlain: string | null;

  @Column({ type: 'varchar', length: 30, default: 'db' })
  source: string;

  @Column({ type: 'int', nullable: true })
  updatedById: number | null;
}
