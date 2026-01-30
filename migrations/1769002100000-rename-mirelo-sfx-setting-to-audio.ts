import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameMireloSfxSettingToAudio1769002100000
  implements MigrationInterface
{
  name = 'RenameMireloSfxSettingToAudio1769002100000';

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

    const existing = await queryRunner.query(`
      SELECT COUNT(*) as count
      FROM \`ai_settings\`
      WHERE \`${serviceCol}\` = 'mirelo_sfx_video_to_video'
    `);

    if (Number(existing?.[0]?.count ?? 0) === 0) return;

    await queryRunner.query(`
      UPDATE \`ai_settings\`
      SET \`name\` = 'Mirelo Audio V1.5 Video-to-Video',
          \`description\` = 'Generate synced sound effects for any video, returning a new video with an updated soundtrack.'
      WHERE \`${serviceCol}\` = 'mirelo_sfx_video_to_video'
        AND \`type\` = 'video'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const serviceCol = (await this.columnExists(queryRunner, 'ai_settings', 'aiService'))
      ? 'aiService'
      : 'ai_service';

    const existing = await queryRunner.query(`
      SELECT COUNT(*) as count
      FROM \`ai_settings\`
      WHERE \`${serviceCol}\` = 'mirelo_sfx_video_to_video'
    `);

    if (Number(existing?.[0]?.count ?? 0) === 0) return;

    await queryRunner.query(`
      UPDATE \`ai_settings\`
      SET \`name\` = 'Mirelo SFX V1.5 Video-to-Video',
          \`description\` = 'Generate synced sound effects for any video, returning a new video with an updated soundtrack.'
      WHERE \`${serviceCol}\` = 'mirelo_sfx_video_to_video'
        AND \`type\` = 'video'
    `);
  }
}

