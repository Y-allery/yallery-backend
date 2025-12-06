import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateAiProcessorMapping1765000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'ai_processor_mapping',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'ai_service',
            type: 'varchar',
            isUnique: true,
          },
          {
            name: 'processor_type',
            type: 'enum',
            enum: ['fal_ai', 'x_router', 'custom'],
          },
          {
            name: 'queue_name',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'concurrency',
            type: 'int',
            default: 60,
          },
          {
            name: 'lock_duration',
            type: 'int',
            default: 120000,
          },
          {
            name: 'is_edit',
            type: 'boolean',
            default: false,
          },
          {
            name: 'completed_notification_param',
            type: 'boolean',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'ai_processor_mapping',
      new TableIndex({
        name: 'IDX_ai_processor_mapping_ai_service',
        columnNames: ['ai_service'],
      }),
    );

    await queryRunner.query(`
      INSERT INTO ai_processor_mapping (ai_service, processor_type, queue_name, concurrency, lock_duration, is_edit, completed_notification_param)
      VALUES
        ('flux', 'fal_ai', 'flux', 60, 120000, false, false),
        ('aura_flow', 'fal_ai', 'aura_flow', 60, 120000, false, null),
        ('realistic_vision', 'fal_ai', 'realistic_vision', 60, 120000, false, null),
        ('flux_pro_fine_tune', 'fal_ai', 'flux_pro_fine_tune', 60, 120000, false, null),
        ('bytedance_edit', 'fal_ai', 'bytedance_edit', 60, 120000, true, true),
        ('x_router', 'x_router', 'x_router', 20, 180000, false, false)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('ai_processor_mapping');
  }
}

