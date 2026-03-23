import { MigrationInterface, QueryRunner } from 'typeorm';

export class ActivateMmaudioV2AudioAiSetting1769131000000
  implements MigrationInterface
{
  name = 'ActivateMmaudioV2AudioAiSetting1769131000000';

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
    const serviceCol = (await this.columnExists(queryRunner, 'ai_settings', 'aiService'))
      ? 'aiService'
      : 'ai_service';
    const isActiveCol = (await this.columnExists(queryRunner, 'ai_settings', 'isActive'))
      ? 'isActive'
      : 'is_active';

    await queryRunner.query(`
      UPDATE \`ai_settings\`
      SET \`${isActiveCol}\` = 1,
          \`type\` = 'audio'
      WHERE \`${serviceCol}\` = 'mmaudio_v2'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const serviceCol = (await this.columnExists(queryRunner, 'ai_settings', 'aiService'))
      ? 'aiService'
      : 'ai_service';
    const isActiveCol = (await this.columnExists(queryRunner, 'ai_settings', 'isActive'))
      ? 'isActive'
      : 'is_active';

    await queryRunner.query(`
      UPDATE \`ai_settings\`
      SET \`${isActiveCol}\` = 0
      WHERE \`${serviceCol}\` = 'mmaudio_v2'
    `);
  }
}
