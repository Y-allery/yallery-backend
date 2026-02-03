import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMmaudioV2AiSetting1769002500000 implements MigrationInterface {
  name = 'AddMmaudioV2AiSetting1769002500000';

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

    // Insert new mmaudio_v2 service if missing
    const existingMmaudio = await queryRunner.query(`
      SELECT COUNT(*) as count
      FROM \`ai_settings\`
      WHERE \`${serviceCol}\` = 'mmaudio_v2'
    `);
    if (Number(existingMmaudio?.[0]?.count ?? 0) === 0) {
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

    // Deactivate old Mirelo setting if it exists (we replaced it with mmaudio_v2)
    const existingMirelo = await queryRunner.query(`
      SELECT COUNT(*) as count
      FROM \`ai_settings\`
      WHERE \`${serviceCol}\` = 'mirelo_sfx_video_to_video'
    `);
    if (Number(existingMirelo?.[0]?.count ?? 0) > 0) {
      await queryRunner.query(`
        UPDATE \`ai_settings\`
        SET \`${isActiveCol}\` = 0
        WHERE \`${serviceCol}\` = 'mirelo_sfx_video_to_video' AND \`type\` = 'video'
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const serviceCol = (await this.columnExists(queryRunner, 'ai_settings', 'aiService'))
      ? 'aiService'
      : 'ai_service';
    const isActiveCol = (await this.columnExists(queryRunner, 'ai_settings', 'isActive'))
      ? 'isActive'
      : 'is_active';

    // Remove mmaudio_v2
    await queryRunner.query(`
      DELETE FROM \`ai_settings\`
      WHERE \`${serviceCol}\` = 'mmaudio_v2' AND \`type\` = 'video'
    `);

    // Reactivate mirelo
    await queryRunner.query(`
      UPDATE \`ai_settings\`
      SET \`${isActiveCol}\` = 1
      WHERE \`${serviceCol}\` = 'mirelo_sfx_video_to_video' AND \`type\` = 'video'
    `);
  }
}

