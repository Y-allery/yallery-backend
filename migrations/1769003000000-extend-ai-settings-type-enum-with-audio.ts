import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendAiSettingsTypeEnumWithAudio1769003000000
  implements MigrationInterface
{
  name = 'ExtendAiSettingsTypeEnumWithAudio1769003000000';

  private async columnExists(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
  ): Promise<boolean> {
    const result = await queryRunner.query(`
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = '${tableName}'
      AND COLUMN_NAME = '${columnName}'
    `);
    return Number(result?.[0]?.count ?? 0) > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const typeColExists = await this.columnExists(queryRunner, 'ai_settings', 'type');
    if (!typeColExists) return;

    // MySQL: extend ENUM to include 'audio'
    await queryRunner.query(`
      ALTER TABLE \`ai_settings\`
      MODIFY COLUMN \`type\` ENUM('image', 'video', 'audio') NOT NULL DEFAULT 'image'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const typeColExists = await this.columnExists(queryRunner, 'ai_settings', 'type');
    if (!typeColExists) return;

    // Revert to previous enum values
    await queryRunner.query(`
      ALTER TABLE \`ai_settings\`
      MODIFY COLUMN \`type\` ENUM('image', 'video') NOT NULL DEFAULT 'image'
    `);
  }
}

