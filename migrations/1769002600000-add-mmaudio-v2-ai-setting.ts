import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMmaudioV2AiSetting1769002600000 implements MigrationInterface {
  name = 'AddMmaudioV2AiSetting1769002600000';

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
    const modelCol = (await this.columnExists(queryRunner, 'ai_settings', 'apiModel'))
      ? 'apiModel'
      : 'api_model';
    const isActiveCol = (await this.columnExists(queryRunner, 'ai_settings', 'isActive'))
      ? 'isActive'
      : 'is_active';
    const isArtemCol = (await this.columnExists(queryRunner, 'ai_settings', 'isArtem'))
      ? 'isArtem'
      : 'is_artem';

    const existing = await queryRunner.query(`
      SELECT COUNT(*) as count
      FROM \`ai_settings\`
      WHERE \`${serviceCol}\` = 'mmaudio_v2'
    `);
    if (Number(existing?.[0]?.count ?? 0) > 0) return;

    await queryRunner.query(`
      INSERT IGNORE INTO \`ai_settings\` (
        \`${serviceCol}\`, \`name\`, \`allowedOrientations\`, \`minImages\`, \`maxImages\`,
        \`maxPromptLength\`, \`sizes\`, \`qualityOptions\`, \`styles\`, \`cost\`,
        \`${modelCol}\`, \`description\`, \`type\`, \`${isArtemCol}\`, \`${isActiveCol}\`
      ) VALUES (
        'mmaudio_v2',
        'MMAudio V2 Video-to-Video',
        '[]',
        1,
        1,
        1000,
        NULL,
        NULL,
        NULL,
        100,
        'fal-ai/mmaudio-v2',
        'Generate synchronized audio for a video based on a text prompt, returning a new video with an audio track.',
        'video',
        0,
        1
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const serviceCol = (await this.columnExists(queryRunner, 'ai_settings', 'aiService'))
      ? 'aiService'
      : 'ai_service';

    await queryRunner.query(`
      DELETE FROM \`ai_settings\`
      WHERE \`${serviceCol}\` = 'mmaudio_v2' AND \`type\` = 'video'
    `);
  }
}

