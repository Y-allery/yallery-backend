import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSocialPostSettingsToContests1769003200000
  implements MigrationInterface
{
  name = 'AddSocialPostSettingsToContests1769003200000';

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
    const exists = await this.columnExists(
      queryRunner,
      'contests',
      'socialPostSettings',
    );
    if (exists) return;

    await queryRunner.query(`
      ALTER TABLE \`contests\`
      ADD COLUMN \`socialPostSettings\` JSON NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const exists = await this.columnExists(
      queryRunner,
      'contests',
      'socialPostSettings',
    );
    if (!exists) return;

    await queryRunner.query(`
      ALTER TABLE \`contests\`
      DROP COLUMN \`socialPostSettings\`
    `);
  }
}
